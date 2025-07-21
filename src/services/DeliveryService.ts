import { SupabaseService } from './SupabaseService';
import { DistanceMatrixService } from './DistanceMatrixService';
import { GeocodingService } from './GeocodingService';
import { OrToolsService, VRPTWData, VRPTWResult } from './OrToolsService';
import { RouteStorageService } from './RouteStorageService';
import { v4 as uuidv4 } from 'uuid';



export interface DeliveryLocation {
  id: string;
  address: string;
  timeWindow: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
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
  numVehicles: number;
}


export interface DeliveryRoute {
  vehicleId: number;
  stops: Array<{
    locationId: string;
    address: string;
    eta: string;
    timeWindow: {
      start: string;
      end: string;
    };
  }>;
  departureTime: string;
  totalDistance: number;
  totalTime: number;
  trafficAwareEta?: number;
  trafficAwareSummary?: string;
}

export interface DeliveryResult {
  routes: DeliveryRoute[];
  totalDistance: number;
  totalTime: number;
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
    console.log(`🗺️ Clustering ${deliveries.length} deliveries into optimal batches of ${maxBatchSize}`);

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

    console.log(`✅ Created ${clusters.length} optimized clusters:`);
    clusters.forEach((cluster, index) => {
      const totalDistance = cluster.reduce((sum, delivery) => {
        const deliveryData = distancesFromDepot.find(d => d.delivery.id === delivery.id);
        return sum + (deliveryData?.distanceFromDepot || 0);
      }, 0);
      console.log(`   Cluster ${index + 1}: ${cluster.length} deliveries, avg distance: ${(totalDistance / cluster.length / 1000).toFixed(1)}km`);
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



  async optimizeDeliveryRoutes(request: DeliveryRequest, customStartTime?: { date: string; time: string; minutesFromMidnight: number }): Promise<DeliveryResult> {
    try {
      console.log(`🚚 Optimizing delivery routes for ${request.deliveries.length} deliveries with ${request.numVehicles} vehicles`);

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

      // Step 2: Get distance and time matrices
      const locationObjects = geocodedAddresses.map((coords, index) => ({
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
      console.log('🧮 Distance matrix (meters):', JSON.stringify(distanceMatrix, null, 2));
      console.log('⏱️ Time matrix (seconds):', JSON.stringify(timeMatrix, null, 2));

      // Step 3: Convert time windows to seconds from midnight
      const timeWindows: [number, number][] = [[depotTimeWindow[0] * 60, depotTimeWindow[1] * 60]]; // Convert minutes to seconds

      for (const delivery of request.deliveries) {
        const startMinutes = this.timeToMinutes(delivery.timeWindow.start);
        const endMinutes = this.timeToMinutes(delivery.timeWindow.end);
        timeWindows.push([startMinutes * 60, endMinutes * 60]); // Convert minutes to seconds
      }

      // Debug: Print time windows
      console.log('🕰️ Time windows (seconds from midnight):', JSON.stringify(timeWindows));

      // Step 4: Prepare data for OR-Tools solver
      const solverData: VRPTWData = {
        num_vehicles: request.numVehicles,
        depot: 0,
        distance_matrix: distanceMatrix,
        time_matrix: timeMatrix,
        time_windows: timeWindows
      };

      console.log('🧪 Debug Preview:');
      console.log('   ➤ Sample travel time (0→1):', timeMatrix[0][1]);
      console.log('   ➤ Sample time window:', timeWindows[1]);

      // Debug: Log the data being sent to solver
      console.log('🔍 Solver data:', JSON.stringify(solverData, null, 2));

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
            // Depot
            return {
              locationId: 'depot',
              address: typeof request.depotAddress === 'string' 
              ? request.depotAddress 
              : request.depotAddress.address,

              eta: stopIndex === 0 ? this.calculateDepartureTime(solverRoute, timeMatrix) : 
                   this.minutesToTime(this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix)),
              timeWindow: {
                start: this.minutesToTime(depotTimeWindow[0]),
                end: this.minutesToTime(depotTimeWindow[1])
              }              
            };
          } else {
            // Delivery location
            const delivery = request.deliveries[nodeIndex - 1];
            const arrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
            return {
              locationId: delivery.id,
              address: delivery.address,
              eta: this.minutesToTime(arrivalTime),
              timeWindow: delivery.timeWindow
            };
          }
        });

        return {
          vehicleId: solverRoute.vehicle_id + 1,
          stops,
          departureTime: this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime),
          totalDistance: Math.round(solverRoute.distance), // Distance in meters
          totalTime: Math.round(solverRoute.time / 60) // Convert seconds to minutes
        };
      });

      const result = {
        routes,
        totalDistance: Math.round(solverResult.total_distance || 0), // Distance in meters
        totalTime: Math.round((solverResult.total_time || 0) / 60), // Convert seconds to minutes
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
          numVehicles: request.numVehicles,
          numVehiclesUsed: result.numVehiclesUsed,
          totalDistance: result.totalDistance,
          totalTime: result.totalTime,
          routes: result.routes
        });

        console.log(`💾 Route stored with ID: ${routeId}`);
      } catch (storageError) {
        console.warn('⚠️ Failed to store route:', storageError);
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
    
    // Calculate travel time from depot to first delivery (including service time)
    const travelTimeToFirstDelivery = timeMatrix[0][firstDeliveryNode] + 600; // Add 10 min service time
    
    // Get the arrival time at first delivery
    const arrivalTimeAtFirstDelivery = route.arrival_times?.[firstDeliveryIndex] || 0;
    
    // Calculate departure time: arrival time - travel time
    const departureTimeSeconds = arrivalTimeAtFirstDelivery - travelTimeToFirstDelivery;
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
    numVehicles: number;
    depotAddress?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    startTime?: string;
  }): Promise<DeliveryResult> {
    try {
      console.log(`🚚 Optimizing delivery routes from database with ${params.numVehicles} vehicles`);

      // Step 1: Get real deliveries from Supabase
      const deliveries = await this.supabaseService.getDeliveries({
        fromDate: params.fromDate,
        toDate: params.toDate,
        status: params.status,
        limit: params.limit || 100, // Use provided limit or default to 100
        offset: params.offset || 0  // Use provided offset or default to 0
      });

      if (deliveries.length === 0) {
        throw new Error('No deliveries found for the specified criteria');
      }

      console.log(`📦 Found ${deliveries.length} deliveries to optimize`);

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
        numVehicles: params.numVehicles
      };

      // Step 6: Handle clustering internally based on delivery count
      let result: DeliveryResult;
      if (deliveryLocations.length > 24) {
        console.log(`📊 Large delivery set detected (${deliveryLocations.length} deliveries). Using intelligent clustering...`);
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
          console.log(`📦 Optimizing cluster ${clusterIndex + 1}/${allClusters.length} with ${targetCluster.length} deliveries`);
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
            numVehicles: params.numVehicles
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
        console.log(`📊 Small delivery set (${deliveryLocations.length} deliveries). Using direct optimization...`);
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
          numVehicles: params.numVehicles,
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