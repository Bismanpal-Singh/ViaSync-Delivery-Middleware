import { SupabaseService } from './SupabaseService';
import { DistanceMatrixService } from './DistanceMatrixService';
import { GeocodingService } from './GeocodingService';
import { OrToolsService, VRPTWData, VRPTWResult } from './OrToolsService';
import { RouteStorageService } from './RouteStorageService';
import { v4 as uuidv4 } from 'uuid';



export interface DeliveryLocation {
  id: string; // This will be a comma-separated list of delivery IDs if merged
  address: string;
  timeWindow: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  deliveryIds?: string[]; // List of merged delivery IDs
  coords?: { lat: number; lon: number }; // Geocoded coordinates for merged deliveries
}

export interface DeliveryRequest {
  depotAddress: string | {
    address: string;
    timeWindow?: {
      start: string;
      end: string;
    };
  };
  deliveries: DeliveryLocation[];
  vehicleCapacities: number[]; // Required - number of vehicles derived from array length
}


export interface DeliveryRoute {
  vehicleId: number;
  stops: Array<{
    locationId: string;
    address: string;
    eta?: string; // Keep for backward compatibility
    arrivalTime?: string;
    departureTime?: string;
    timeWindow: {
      start: string;
      end: string;
    };
    deliveryIds?: string[];
  }>;
  departureTime: string;
  totalDistance: number;
  totalTime: number;
  trafficAwareEta?: number;
  trafficAwareSummary?: string;
  load?: number;
  capacity?: number;
}

export interface DeliveryResult {
  routes: DeliveryRoute[];
  totalDistance: number;
  totalTime: number;
  totalLoad?: number;
  numVehiclesUsed: number;
  warnings?: string[];
}





export class DeliveryService {
  private supabaseService: SupabaseService;
  private distanceMatrixService: DistanceMatrixService;
  private geocodingService: GeocodingService;
  private orToolsService: OrToolsService;
  private routeStorageService: RouteStorageService;

  constructor() {
    // Initialize with environment variables
    const config = {
      url: process.env.SUPABASE_URL!,
      key: process.env.SUPABASE_ANON_KEY!
    };
    this.supabaseService = new SupabaseService(config);
    this.distanceMatrixService = new DistanceMatrixService();
    this.geocodingService = new GeocodingService();
    this.orToolsService = new OrToolsService();
    this.routeStorageService = new RouteStorageService();
  }

  /**
   * Common method to fetch deliveries using the same filtering logic
   * as the GET /api/delivery/pending endpoint
   * This ensures consistency between what the user sees and what gets optimized
   */
  private async getPendingDeliveriesForDate(date: string, limit: number = 200): Promise<any[]> {
    return await this.supabaseService.getDeliveries({
      fromDate: date,
      toDate: date,
      status: 'Booked,Pending', // Same as pending endpoint
      limit: limit
    });
  }

  private timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private getCustomStartTime(startDate?: string, startTime?: string): { date: string; time: string; minutesFromMidnight: number } {
    const now = new Date();
    
    // Use provided date or current date
    const targetDate = startDate ? new Date(startDate) : now;
    
    // Use provided time or current time
    let targetTime: string;
    if (startTime) {
      targetTime = startTime;
    } else {
      targetTime = this.minutesToTime(now.getHours() * 60 + now.getMinutes());
    }
    
    // Calculate minutes from midnight for the target time
    const [hours, minutes] = targetTime.split(':').map(Number);
    const minutesFromMidnight = hours * 60 + minutes;
    
    return {
      date: targetDate.toISOString().split('T')[0],
      time: targetTime,
      minutesFromMidnight
    };
  }

  /**
   * Calculate rough distance between two coordinates using Haversine formula
   */
  private calculateRoughDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(this.toRadians(lat1)) *
              Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Calculate time window compatibility score between a delivery and existing cluster
   * Lower score = better compatibility
   */
  private calculateTimeCompatibilityScore(
    cluster: DeliveryLocation[],
    newDelivery: DeliveryLocation
  ): number {
    if (cluster.length === 0) return 0; // First delivery in cluster

    // Convert time windows to minutes for easier comparison
    const newStart = this.timeToMinutes(newDelivery.timeWindow.start);
    const newEnd = this.timeToMinutes(newDelivery.timeWindow.end);

    let totalCompatibilityScore = 0;
    let validComparisons = 0;

    for (const existingDelivery of cluster) {
      const existingStart = this.timeToMinutes(existingDelivery.timeWindow.start);
      const existingEnd = this.timeToMinutes(existingDelivery.timeWindow.end);

      // Calculate overlap between time windows
      const overlapStart = Math.max(newStart, existingStart);
      const overlapEnd = Math.min(newEnd, existingEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      // Calculate center points of time windows
      const newCenter = (newStart + newEnd) / 2;
      const existingCenter = (existingStart + existingEnd) / 2;
      const timeDistance = Math.abs(newCenter - existingCenter);

      // Score based on overlap and time distance
      // More overlap = better compatibility (lower score)
      // Closer time centers = better compatibility (lower score)
      const windowOverlapScore = Math.max(0, 60 - overlap); // 60 minutes = perfect overlap
      const timeDistanceScore = Math.min(timeDistance, 240); // Cap at 4 hours
      
      const compatibilityScore = windowOverlapScore + timeDistanceScore;
      totalCompatibilityScore += compatibilityScore;
      validComparisons++;
    }

    return validComparisons > 0 ? totalCompatibilityScore / validComparisons : 0;
  }

  /**
   * Cluster deliveries into optimal batches based on geographic proximity
   * This ensures that geographically close deliveries are processed together
   */
  private async clusterDeliveriesForOptimization(
    depotAddress: string,
    deliveries: DeliveryLocation[],
    maxBatchSize: number = 24 // 24 deliveries + 1 depot = 25 total (Routes API limit)
  ): Promise<DeliveryLocation[][]> {
          console.log(`Clustering ${deliveries.length} deliveries into batches of ${maxBatchSize}`);

    // Step 1: Geocode all addresses (including depot) to get coordinates
    const allAddresses = [depotAddress, ...deliveries.map(d => d.address)];
    const geocodedAddresses = await Promise.all(
      allAddresses.map(addr => this.geocodingService.geocodeAddress(addr))
    );

    // Check if all addresses were geocoded successfully
    const failedGeocoding = geocodedAddresses.findIndex(coords => !coords);
    if (failedGeocoding !== -1) {
      throw new Error(`Failed to geocode address: ${allAddresses[failedGeocoding]}`);
    }

    const depotCoords = geocodedAddresses[0]!;
    const deliveryCoords = geocodedAddresses.slice(1);

    // Step 2: Calculate rough distances from depot to all deliveries
    const distancesFromDepot = deliveryCoords.map((coords, index) => ({
      delivery: deliveries[index],
      coords: coords!,
      distanceFromDepot: this.calculateRoughDistance(
        depotCoords.lat, depotCoords.lon,
        coords!.lat, coords!.lon
      )
    }));

    // Step 3: Sort deliveries by distance from depot
    distancesFromDepot.sort((a, b) => a.distanceFromDepot - b.distanceFromDepot);

    // Step 4: Use K-means inspired clustering to group nearby deliveries
    const clusters: DeliveryLocation[][] = [];
    const usedDeliveries = new Set<string>();

    while (usedDeliveries.size < deliveries.length) {
      const currentCluster: DeliveryLocation[] = [];
      
      // Find the closest unused delivery to start this cluster
      let seedDelivery = distancesFromDepot.find(d => !usedDeliveries.has(d.delivery.id));
      if (!seedDelivery) break;

      currentCluster.push(seedDelivery.delivery);
      usedDeliveries.add(seedDelivery.delivery.id);

      // Find other deliveries that are close to this cluster
      const clusterCoords = [seedDelivery.coords];
      
      while (currentCluster.length < maxBatchSize && usedDeliveries.size < deliveries.length) {
        let bestDelivery: typeof seedDelivery | null = null;
        let bestScore = Infinity;

        // Find the delivery that's closest to the current cluster
        for (const deliveryData of distancesFromDepot) {
          if (usedDeliveries.has(deliveryData.delivery.id)) continue;

          // Calculate average distance to all deliveries in current cluster
          const avgDistanceToCluster = clusterCoords.reduce((sum, coord) => {
            return sum + this.calculateRoughDistance(
              coord.lat, coord.lon,
              deliveryData.coords.lat, deliveryData.coords.lon
            );
          }, 0) / clusterCoords.length;

          // Enhanced scoring: Consider both geographic proximity AND time window compatibility
          const geographicScore = avgDistanceToCluster * 0.5 + deliveryData.distanceFromDepot * 0.2;
          
          // Calculate time window compatibility score
          const timeCompatibilityScore = this.calculateTimeCompatibilityScore(
            currentCluster,
            deliveryData.delivery
          );
          
          // Combined score: 50% geographic + 30% time compatibility + 20% depot distance
          const score = geographicScore + timeCompatibilityScore * 0.3;

          if (score < bestScore) {
            bestScore = score;
            bestDelivery = deliveryData;
          }
        }

        if (bestDelivery) {
          currentCluster.push(bestDelivery.delivery);
          clusterCoords.push(bestDelivery.coords);
          usedDeliveries.add(bestDelivery.delivery.id);
        } else {
          break;
        }
      }

      clusters.push(currentCluster);
    }

          console.log(`Created ${clusters.length} clusters`);
    clusters.forEach((cluster, index) => {
      const totalDistance = cluster.reduce((sum, delivery) => {
        const deliveryData = distancesFromDepot.find(d => d.delivery.id === delivery.id);
        return sum + (deliveryData?.distanceFromDepot || 0);
      }, 0);
      console.log(`   Cluster ${index + 1}: ${cluster.length} deliveries`);
    });

    return clusters;
  }

  /**
   * Get optimal delivery clusters for pagination
   * This returns clusters that can be optimized one at a time
   */
  private async getOptimalDeliveryClusters(
    depotAddress: string,
    deliveries: DeliveryLocation[],
    maxBatchSize: number = 24 // 24 deliveries + 1 depot = 25 total (Routes API limit)
  ): Promise<DeliveryLocation[][]> {
    console.log(`🗺️ Creating optimal delivery clusters for pagination (${deliveries.length} deliveries)`);
    
    // Use the same clustering logic but return all clusters
    const clusters = await this.clusterDeliveriesForOptimization(
      depotAddress,
      deliveries,
      maxBatchSize
    );

    console.log(`✅ Created ${clusters.length} optimal clusters for pagination`);
    clusters.forEach((cluster, index) => {
      console.log(`   Cluster ${index + 1}: ${cluster.length} deliveries`);
    });

    return clusters;
  }

  /**
   * Merge deliveries at the same address (lat/lon) into a single stop
   */
  private mergeDuplicateDeliveries(deliveries: DeliveryLocation[], geocodedAddresses: {lat: number, lon: number}[]): DeliveryLocation[] {
    const merged: {[key: string]: DeliveryLocation} = {};
    const coordToIds: {[key: string]: string[]} = {};
    const coordToWindows: {[key: string]: {start: string[], end: string[]}} = {};
    deliveries.forEach((delivery, idx) => {
      const coords = geocodedAddresses[idx];
      // Use rounded lat/lon as key (to avoid floating point issues)
      const key = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
      if (!merged[key]) {
        merged[key] = {
          id: delivery.id,
          address: delivery.address,
          timeWindow: { start: delivery.timeWindow.start, end: delivery.timeWindow.end },
          deliveryIds: [delivery.id],
          coords // attach coords for later use
        };
        coordToIds[key] = [delivery.id];
        coordToWindows[key] = { start: [delivery.timeWindow.start], end: [delivery.timeWindow.end] };
      } else {
        merged[key].deliveryIds!.push(delivery.id);
        coordToIds[key].push(delivery.id);
        coordToWindows[key].start.push(delivery.timeWindow.start);
        coordToWindows[key].end.push(delivery.timeWindow.end);
      }
    });
    // Combine time windows for merged stops
    Object.keys(merged).forEach(key => {
      const starts = coordToWindows[key].start.map(t => parseInt(t.replace(':', ''), 10));
      const ends = coordToWindows[key].end.map(t => parseInt(t.replace(':', ''), 10));
      // Earliest start, latest end
      const minStart = Math.min(...starts);
      const maxEnd = Math.max(...ends);
      // Convert back to HH:MM
      const pad = (n: number) => n.toString().padStart(4, '0');
      merged[key].timeWindow.start = pad(minStart).slice(0,2) + ':' + pad(minStart).slice(2);
      merged[key].timeWindow.end = pad(maxEnd).slice(0,2) + ':' + pad(maxEnd).slice(2);
      // Use comma-separated IDs for merged node
      merged[key].id = merged[key].deliveryIds!.join(',');
    });
    return Object.values(merged);
  }

  async optimizeDeliveryRoutes(request: DeliveryRequest, customStartTime?: { date: string; time: string; minutesFromMidnight: number }): Promise<DeliveryResult> {
    try {
      console.log(`Optimizing ${request.deliveries.length} deliveries with ${request.vehicleCapacities.length} vehicles`);

      // Step 1: Geocode all addresses
      let depotAddressStr: string;
      let depotTimeWindow: [number, number] = [420, 1440]; // default 7:00 AM to midnight

      if (typeof request.depotAddress === 'string') {
        depotAddressStr = request.depotAddress;
      } else {
        depotAddressStr = request.depotAddress.address;
        if (request.depotAddress.timeWindow) {
          depotTimeWindow = [
            this.timeToMinutes(request.depotAddress.timeWindow.start),
            this.timeToMinutes(request.depotAddress.timeWindow.end)
          ];
        }
      }

      // Override depot time window if custom start time is provided
      if (customStartTime) {
        console.log(`⏰ Using custom start time: ${customStartTime.date} at ${customStartTime.time}`);
        depotTimeWindow = [customStartTime.minutesFromMidnight, 1440]; // From custom start time to end of day
      }

      const allAddresses = [depotAddressStr, ...request.deliveries.map(d => d.address)];

      const geocodedAddresses = await Promise.all(
        allAddresses.map(addr => this.geocodingService.geocodeAddress(addr))
      );

      // Debug: Print geocoded coordinates
      console.log('🗺️ Geocoded addresses:');
      geocodedAddresses.forEach((coords, idx) => {
        console.log(`   [${idx}] ${allAddresses[idx]} =>`, coords);
      });

      // Check if all addresses were geocoded successfully
      const failedGeocoding = geocodedAddresses.findIndex(coords => !coords);
      if (failedGeocoding !== -1) {
        throw new Error(`Failed to geocode address: ${allAddresses[failedGeocoding]}`);
      }

      // Merge duplicate deliveries (excluding depot)
      const validGeocoded = geocodedAddresses.slice(1).filter((g): g is any => !!g && typeof g.lat === 'number' && typeof g.lon === 'number');
      const validDeliveries = request.deliveries.filter((_, idx) => {
        const g = geocodedAddresses[idx + 1];
        return !!g && typeof g.lat === 'number' && typeof g.lon === 'number';
      });
      const mergedDeliveries = this.mergeDuplicateDeliveries(validDeliveries, validGeocoded);
      // Build merged geocoded list to match mergedDeliveries order
      const mergedGeocoded: {lat: number, lon: number}[] = mergedDeliveries.map(md => md.coords).filter((c): c is {lat: number, lon: number} => !!c);
      // Step 2: Get distance and time matrices
      const locationObjects = [geocodedAddresses[0], ...mergedGeocoded].map((coords, index) => ({
        lat: coords!.lat,
        lon: coords!.lon,
        type: index === 0 ? 'depot' as const : 'order' as const,
        orderId: index === 0 ? undefined : index
      }));
      const matrixResult = await this.distanceMatrixService.getDistanceMatrix(locationObjects);
      if (!matrixResult) {
        throw new Error('Failed to get distance and time matrices');
      }
      // Keep distances in meters and times in seconds for OR-Tools consistency
      const distanceMatrix = matrixResult.distances; // Already in meters
      const timeMatrix = matrixResult.matrix; // Already in seconds
      // Debug: Print sample of distance and time matrices
      // Distance matrix is internal data - no need to log
      // Time matrix and windows are internal data - no need to log
      // Step 3: Convert time windows to seconds from midnight
      const timeWindows: [number, number][] = [[depotTimeWindow[0] * 60, depotTimeWindow[1] * 60]]; // Convert minutes to seconds
      for (const delivery of mergedDeliveries) {
        const startMinutes = this.timeToMinutes(delivery.timeWindow.start);
        const endMinutes = this.timeToMinutes(delivery.timeWindow.end);
        timeWindows.push([startMinutes * 60, endMinutes * 60]); // Convert minutes to seconds
      }
      // Debug: Print time windows
      // Time windows are internal data - no need to log
      // Step 4: Prepare data for OR-Tools solver
      // Each delivery has a demand of 1, depot has demand of 0
      const demands = [0, ...Array(mergedDeliveries.length).fill(1)];
      const solverData: VRPTWData = {
        num_vehicles: request.vehicleCapacities.length,
        depot: 0,
        distance_matrix: distanceMatrix,
        time_matrix: timeMatrix,
        time_windows: timeWindows,
        vehicle_capacities: request.vehicleCapacities,
        demands: demands
      };
      // Log essential information only
      console.log(`Optimizing ${mergedDeliveries.length} deliveries with ${request.vehicleCapacities.length} vehicles`);
      // Step 5: Solve with OR-Tools
      const solverResult = await this.orToolsService.solveVRPTW(solverData);
      if (solverResult.error) {
        throw new Error(`Solver failed: ${solverResult.error}`);
      }
      if (!solverResult.routes || solverResult.routes.length === 0) {
        throw new Error('No feasible routes found');
      }
      // Step 6: Convert solver result to delivery routes
      const routes: DeliveryRoute[] = solverResult.routes.map(solverRoute => {
        const stops = solverRoute.route.map((nodeIndex, stopIndex) => {
          if (nodeIndex === 0) {
            // Depot - no service time added by solver
            const departureTime = stopIndex === 0 ? 
              this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime) :
              this.minutesToTime(this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix)); // No service time at depot
            
            // For depot, arrival and departure should be the same (no service time)
            const arrivalTime = customStartTime ? 
              this.timeToMinutes(customStartTime.time) : 
              this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
            
            return {
              locationId: 'depot',
              address: typeof request.depotAddress === 'string' 
              ? request.depotAddress 
              : request.depotAddress.address,
              arrivalTime: this.minutesToTime(arrivalTime),
              departureTime: departureTime,
              timeWindow: {
                start: this.minutesToTime(depotTimeWindow[0]),
                end: this.minutesToTime(depotTimeWindow[1])
              }              
            };
          } else {
            // Delivery location (merged)
            const delivery = mergedDeliveries[nodeIndex - 1];
            // The solver's arrival time includes service time from previous stops
            // We need to calculate the actual arrival time (without service time at this stop)
            const solverArrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
            const actualArrivalTime = solverArrivalTime - 10; // Subtract service time to get actual arrival
            const departureTime = actualArrivalTime + 10; // Add service time for departure
            return {
              locationId: delivery.id,
              address: delivery.address,
              arrivalTime: this.minutesToTime(actualArrivalTime),
              departureTime: this.minutesToTime(departureTime),
              timeWindow: delivery.timeWindow,
              deliveryIds: delivery.deliveryIds // include all merged delivery IDs
            };
          }
        });
        return {
          vehicleId: solverRoute.vehicle_id + 1,
          stops,
          departureTime: this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime),
          totalDistance: Math.round(solverRoute.distance), // Distance in meters
          totalTime: Math.round(solverRoute.time / 60), // Convert seconds to minutes
          load: solverRoute.load,
          capacity: solverRoute.capacity
        };
      });

      const result = {
        routes,
        totalDistance: Math.round(solverResult.total_distance || 0), // Distance in meters
        totalTime: Math.round((solverResult.total_time || 0) / 60), // Convert seconds to minutes
        totalLoad: solverResult.total_load,
        numVehiclesUsed: solverResult.num_vehicles_used || routes.length
      };

      // Automatically store the optimized route
      try {
        const routeId = uuidv4();
        const routeName = `Route ${new Date().toLocaleDateString()} - ${request.deliveries.length} deliveries`;
        const deliveryDate = new Date().toISOString().split('T')[0];
        const depotAddress = typeof request.depotAddress === 'string' 
          ? request.depotAddress 
          : request.depotAddress.address;

        await this.routeStorageService.storeRoute({
          id: routeId,
          routeName,
          deliveryDate,
          depotAddress,
          numVehicles: request.vehicleCapacities.length,
          numVehiclesUsed: result.numVehiclesUsed,
          totalDistance: result.totalDistance,
          totalTime: result.totalTime,
          routes: result.routes
        });

        console.log(`Route stored: ${routeId}`);
      } catch (storageError) {
        console.warn('Failed to store route:', storageError);
        // Don't fail the optimization if storage fails
      }

      return result;

    } catch (error) {
      console.error('Error optimizing delivery routes:', error);
      throw error;
    }
  }

  private calculateArrivalTime(route: any, stopIndex: number, timeMatrix: number[][]): number {
    // Get the actual arrival time from the solver (in seconds)
    // This is the cumulative time when the vehicle arrives at this stop
    const arrivalTimeSeconds = route.arrival_times?.[stopIndex] || 0;
    
    // Convert to minutes for display
    return Math.round(arrivalTimeSeconds / 60);
  }

  private calculateDepartureTime(route: any, timeMatrix: number[][], customStartTime?: { date: string; time: string; minutesFromMidnight: number }): string {
    // If custom start time is provided, use it directly
    if (customStartTime) {
      return customStartTime.time;
    }

    // Find the first delivery (first non-depot stop)
    const firstDeliveryIndex = route.route.findIndex((node: number) => node !== 0);
    if (firstDeliveryIndex === -1 || firstDeliveryIndex === 0) {
      return 'N/A'; // No delivery found or first stop is depot
    }

    // Get the first delivery node
    const firstDeliveryNode = route.route[firstDeliveryIndex];
    
    // Get the arrival time at first delivery (includes travel time + service time)
    const arrivalTimeAtFirstDelivery = route.arrival_times?.[firstDeliveryIndex] || 0;
    
    // Calculate departure time: arrival time - travel time - service time
    const travelTimeOnly = timeMatrix[0][firstDeliveryNode]; // Just travel time, no service time
    const departureTimeSeconds = arrivalTimeAtFirstDelivery - travelTimeOnly - 600; // Subtract travel time and service time
    const departureTimeMinutes = Math.round(departureTimeSeconds / 60);

    return this.minutesToTime(departureTimeMinutes);
  }

  /**
   * Optimize delivery routes using real delivery data from Supabase
   */
  async optimizeDeliveryRoutesFromDatabase(params: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    vehicleCapacities?: number[];
    depotAddress?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    startTime?: string;
  }): Promise<DeliveryResult> {
    try {
      console.log(`Optimizing routes from database with ${(params.vehicleCapacities || [50]).length} vehicles`);

      // Step 1: Get real deliveries from Supabase using the same filtering logic as GET /api/delivery/pending
      // If a specific date is provided, use the same logic as the pending endpoint
      let deliveries: any[];
      if (params.fromDate && params.toDate && params.fromDate === params.toDate) {
        // Single date - use the same logic as pending endpoint
        console.log(`📅 Using single date filtering (same as GET /api/delivery/pending): ${params.fromDate}`);
        deliveries = await this.getPendingDeliveriesForDate(params.fromDate, params.limit || 200);
      } else {
        // Date range or other criteria - use the original logic but with consistent status
        console.log(`📅 Using date range filtering: ${params.fromDate} to ${params.toDate}`);
        deliveries = await this.supabaseService.getDeliveries({
          fromDate: params.fromDate,
          toDate: params.toDate,
          status: 'Booked,Pending', // Use same status as pending endpoint
          limit: params.limit || 200, // Use same default limit as pending endpoint
          offset: params.offset || 0
        });
      }

      if (deliveries.length === 0) {
        throw new Error('No deliveries found for the specified criteria');
      }

      console.log(`Found ${deliveries.length} deliveries to optimize`);

      // Step 2: Get depot address (shop location)
      const shopLocation = await this.supabaseService.getShopLocation();
      const depotAddress = params.depotAddress || shopLocation;

      // Step 3: Convert deliveries to optimization format
      const deliveryLocations: DeliveryLocation[] = deliveries.map((delivery, index) => {
        // Handle time windows with minimum width
        let startTime = delivery.priority_start_time || '09:00';
        let endTime = delivery.priority_end_time || '17:00';
        
        // If start and end times are the same, it means "any time after start time"
        if (startTime === endTime) {
          endTime = '23:59'; // Set to end of day
        }
        
        // Ensure minimum 30-minute window
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        if (endMinutes - startMinutes < 30) {
          endTime = this.minutesToTime(Math.min(1440, startMinutes + 30));
        }
        
        return {
          id: delivery.id.toString(),
          address: this.supabaseService.formatDeliveryAddress(delivery),
          timeWindow: {
            start: startTime,
            end: endTime
          }
        };
      });

      // Step 4: Get custom start time if provided
      const customStartTime = params.startDate || params.startTime ? 
        this.getCustomStartTime(params.startDate, params.startTime) : 
        undefined;

      // Step 5: Create optimization request
      const optimizationRequest: DeliveryRequest = {
        depotAddress: {
          address: depotAddress,
          timeWindow: {
            start: "07:00",
            end: "23:59"
          }
        },
        deliveries: deliveryLocations,
        vehicleCapacities: params.vehicleCapacities || [50]
      };

      // Step 6: Handle clustering internally based on delivery count
      let result: DeliveryResult;
      if (deliveryLocations.length > 24) {
        console.log(`Large delivery set (${deliveryLocations.length} deliveries). Using clustering...`);
        // Get all optimal clusters
        const allClusters = await this.getOptimalDeliveryClusters(
          depotAddress,
          deliveryLocations,
          24 // Max 24 deliveries per cluster (24 + 1 depot = 25 total)
        );
        // Determine which cluster to optimize based on offset
        const clusterIndex = Math.floor((params.offset || 0) / 24);
        const targetCluster = allClusters[clusterIndex];
        if (targetCluster) {
          console.log(`Optimizing cluster ${clusterIndex + 1}/${allClusters.length} (${targetCluster.length} deliveries)`);
          // Create optimization request for this specific cluster
          const clusterRequest: DeliveryRequest = {
            depotAddress: {
              address: depotAddress,
              timeWindow: {
                start: "07:00",
                end: "23:59"
              }
            },
            deliveries: targetCluster,
            vehicleCapacities: params.vehicleCapacities || [50]
          };
          result = await this.optimizeDeliveryRoutes(clusterRequest, customStartTime);
          // Add cluster information to the result
          result.warnings = result.warnings || [];
          result.warnings.push(`Cluster ${clusterIndex + 1} of ${allClusters.length} (${targetCluster.length} deliveries)`);
        } else {
          throw new Error(`No optimal cluster found for index ${clusterIndex}. Available clusters: 0-${allClusters.length - 1}`);
        }
      } else {
        // Use direct optimization for smaller delivery sets
        console.log(`Small delivery set (${deliveryLocations.length} deliveries). Using direct optimization...`);
        result = await this.optimizeDeliveryRoutes(optimizationRequest, customStartTime);
      }

      // After optimization, get traffic-aware ETA for the optimized route
      try {
        const directionsApiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (directionsApiKey && result.routes && result.routes.length > 0) {
          for (const route of result.routes) {
            const orderedAddresses = route.stops.map(stop => stop.address);
            if (orderedAddresses.length <= 25) {
              const waypoints = orderedAddresses.slice(1, -1).map(addr => encodeURIComponent(addr)).join('|');
              const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(orderedAddresses[0])}&destination=${encodeURIComponent(orderedAddresses[orderedAddresses.length-1])}&waypoints=${waypoints}&departure_time=now&key=${directionsApiKey}`;
              const axios = require('axios');
              const response = await axios.get(url);
              if (response.data && response.data.routes && response.data.routes[0]) {
                // Attach traffic-aware ETA to the route
                route.trafficAwareEta = response.data.routes[0].legs.reduce((sum: number, leg: any) => sum + (leg.duration_in_traffic?.value || 0), 0);
                route.trafficAwareSummary = response.data.routes[0].summary;
              }
            } else {
              route.trafficAwareEta = undefined;
              route.trafficAwareSummary = 'Too many stops for Directions API';
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to get traffic-aware ETA:', err);
      }

      // Automatically store the route with more specific details
      try {
        const routeId = uuidv4();
        const routeName = `Database Route ${params.fromDate || 'all'} - ${deliveries.length} deliveries`;
        const deliveryDate = customStartTime?.date || params.fromDate || new Date().toISOString().split('T')[0];
        const depotAddressStr = depotAddress;

        // Add start time info to route name if custom start time is used
        const finalRouteName = customStartTime ? 
          `${routeName} (Start: ${customStartTime.time})` : 
          routeName;

        await this.routeStorageService.storeRoute({
          id: routeId,
          routeName: finalRouteName,
          deliveryDate,
          depotAddress,
          numVehicles: (params.vehicleCapacities || [50]).length,
          numVehiclesUsed: result.numVehiclesUsed,
          totalDistance: result.totalDistance,
          totalTime: result.totalTime,
          routes: result.routes
        });

        console.log(`💾 Database route stored with ID: ${routeId}`);
        if (customStartTime) {
          console.log(`⏰ Route uses custom start time: ${customStartTime.date} at ${customStartTime.time}`);
        }
      } catch (storageError) {
        console.warn('⚠️ Failed to store database route:', storageError);
        // Don't fail the optimization if storage fails
      }

      return result;

    } catch (error) {
      console.error('Error optimizing delivery routes from database:', error);
      throw error;
    }
  }


} 