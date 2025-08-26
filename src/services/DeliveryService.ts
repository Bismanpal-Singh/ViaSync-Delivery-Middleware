import { SupabaseService } from './SupabaseService';
import { DistanceMatrixService } from './DistanceMatrixService';
import { GeocodingService } from './GeocodingService';
import { OrToolsService, VRPTWData, VRPTWResult } from './OrToolsService';
import { RouteStorageService } from './RouteStorageService';
import { QuickFloraTokenManager } from './QuickFloraTokenManager';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';



export interface DeliveryLocation {
  id: string; // This will be a comma-separated list of delivery IDs if merged
  address: string;
  timeWindow: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  deliveryIds?: string[]; // List of merged delivery IDs
  coords?: { lat: number; lon: number }; // Geocoded coordinates for merged deliveries
  originalDelivery?: any; // Original delivery data from database
  originalDeliveries?: any[]; // Array of original delivery data for merged stops
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
  serviceTimeMinutes?: number; // Optional - service time per stop in minutes (default: 10)
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
    orders?: Array<{
      id: number;
      customer_name: string;
      order_number: string;
      status: string;
      address_1?: string;
      city?: string;
      zip?: string;
      priority_start_time?: string;
      priority_end_time?: string;
    }>;
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
  private quickFloraTokenManager?: QuickFloraTokenManager; // Make optional
  private authService?: any; // Will be injected for user context

  constructor(authService?: any) {
    // Initialize with environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
    }
    
    const config = {
      url: supabaseUrl,
      key: supabaseKey
    };
    
    this.supabaseService = new SupabaseService(config);
    this.distanceMatrixService = new DistanceMatrixService();
    this.geocodingService = new GeocodingService();
    this.orToolsService = new OrToolsService();
    this.routeStorageService = new RouteStorageService();
    // Don't initialize QuickFloraTokenManager here - it will be created when needed
    this.authService = authService;
  }

  /**
   * Syncs delivery data from QuickFlora API to Supabase database.
   * This ensures we always have the latest data before performing operations.
   */
  public async syncDeliveriesFromQuickFlora(params: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    limit?: number;
    offset?: number;
    locationId?: string;
    userContext?: {
      sessionId: string;
      userId: string;
      companyId: string;
      employeeId: string;
    };
    returnData?: boolean; // New parameter to return data directly
  }): Promise<void | any[]> {
    try {
      let token: string;
      let companyId: string;
      
      // Try user authentication first, throw error if no valid session
      if (params.userContext && this.authService && params.userContext.sessionId) {
        try {
          token = await this.authService.getValidBearerToken(params.userContext.sessionId);
          companyId = params.userContext.companyId;
        } catch (authError) {
          throw new Error('Failed to authenticate with user session. Please log in again.');
        }
      } else {
        throw new Error('User authentication required. No valid user session provided.');
      }
      
      // Prepare the request payload for QuickFlora API
      // Use date-only format to avoid timezone confusion
      const targetDate = params.fromDate || new Date().toISOString().split('T')[0];
      
      const requestPayload = {
        companyID: companyId,
        divisionID: "DEFAULT",
        departmentID: "DEFAULT",
        fromDate: targetDate,
        toDate: targetDate,
        locationID: params.locationId || "",
        wholesaleLocationID: true,
        zoneID: "",
        sortExpression: "",
        sortDirection: "",
        displayfilter: 1,
        priorirty: ""
      };

      // Call the QuickFlora API
      const response = await axios.post(
        'https://quickflora-new.com/QuickFloraCoreAPI/DeliveryManager/getOrderDetails',
        requestPayload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'accept': '*/*'
          }
        }
      );

      if (response.data && response.data.data) {
        // If returnData is requested, return the data directly (skip Supabase sync)
        if (params.returnData) {
          return response.data.data;
        }
        
        // Otherwise, sync the data to Supabase with company ID (original behavior)
        await this.supabaseService.syncWithQuickFlora(response.data.data, companyId);
      } else {
        return params.returnData ? [] : undefined;
      }

    } catch (error) {
      console.error('Failed to sync from QuickFlora API:', error);
      
      // If returnData is requested, throw the error (caller needs to handle it)
      if (params.returnData) {
        throw error;
      }
      
      // Otherwise, don't throw error, proceed with data already in Supabase
      // This ensures the application continues to work even if QuickFlora API is down
    }
  }



  /**
   * Common method to fetch deliveries for a specific date with company filtering
   * Used by the GET /api/delivery/deliveries-by-date endpoint
   * This ensures consistency between what the user sees and what gets optimized
   */
  public async getDeliveriesForDate(date: string, limit: number = 200, userContext: {
    sessionId: string;
    userId: string;
    companyId: string;
    employeeId: string;
  }, status?: string, locationId?: string): Promise<any[]> {
    // Require user context
    if (!userContext || !userContext.sessionId || !userContext.companyId) {
      throw new Error('Authentication required - user context missing');
    }

    // First, sync the latest data from QuickFlora using user's credentials
    await this.syncDeliveriesFromQuickFlora({
      fromDate: date,
      toDate: date,
      status: status, // Use provided status or undefined for all
      limit: limit,
      userContext: userContext,
      locationId
    });

    // Then fetch from Supabase filtered by user's company
    return await this.supabaseService.getDeliveries({
      fromDate: date,
      toDate: date,
      status: status, // Use provided status or undefined for all
      limit: limit,
      companyId: userContext.companyId, // Re-enabled company filtering
      locationId
    });
  }

  public timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  public minutesToTime(minutes: number): string {
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
          // Clustering deliveries into batches

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

          // Created clusters

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
    // Creating optimal delivery clusters for pagination
    
    // Use the same clustering logic but return all clusters
    const clusters = await this.clusterDeliveriesForOptimization(
      depotAddress,
      deliveries,
      maxBatchSize
    );

    // Created optimal clusters for pagination

    return clusters;
  }

  /**
   * Merge deliveries at the same address (lat/lon) into a single stop
   */
  private mergeDuplicateDeliveries(deliveries: DeliveryLocation[], geocodedAddresses: {lat: number, lon: number}[]): DeliveryLocation[] {
    const merged: {[key: string]: DeliveryLocation} = {};
    const coordToIds: {[key: string]: string[]} = {};
    const coordToWindows: {[key: string]: {start: string[], end: string[]}} = {};
    const coordToOriginalDeliveries: {[key: string]: any[]} = {};
    
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
          coords, // attach coords for later use
          originalDeliveries: [delivery.originalDelivery] // store original delivery data
        };
        coordToIds[key] = [delivery.id];
        coordToWindows[key] = { start: [delivery.timeWindow.start], end: [delivery.timeWindow.end] };
        coordToOriginalDeliveries[key] = [delivery.originalDelivery];
      } else {
        merged[key].deliveryIds!.push(delivery.id);
        coordToIds[key].push(delivery.id);
        coordToWindows[key].start.push(delivery.timeWindow.start);
        coordToWindows[key].end.push(delivery.timeWindow.end);
        merged[key].originalDeliveries!.push(delivery.originalDelivery);
        coordToOriginalDeliveries[key].push(delivery.originalDelivery);
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
    // Use configurable service time or default to 10 minutes
    const serviceTimeMinutes = request.serviceTimeMinutes || 10;
    const serviceTimeSeconds = serviceTimeMinutes * 60;
    try {
      // Optimizing deliveries

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
        // Using custom start time
        depotTimeWindow = [customStartTime.minutesFromMidnight, 1440]; // From custom start time to end of day
      }

      const allAddresses = [depotAddressStr, ...request.deliveries.map(d => d.address)];

      const geocodedAddresses = await Promise.all(
        allAddresses.map(addr => this.geocodingService.geocodeAddress(addr))
      );

      // Geocoded addresses

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
      // Optimizing merged deliveries
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
            const isFirstStop = stopIndex === 0;
            const isLastStop = stopIndex === solverRoute.route.length - 1;
            
            if (isFirstStop) {
              // First stop (departure from depot)
              const departureTime = this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime);
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
            } else if (isLastStop) {
              // Last stop (return to depot)
              const arrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
              
              return {
                locationId: 'depot',
                address: typeof request.depotAddress === 'string' 
                ? request.depotAddress 
                : request.depotAddress.address,
                arrivalTime: this.minutesToTime(arrivalTime),
                departureTime: this.minutesToTime(arrivalTime), // Same as arrival (end of route)
                timeWindow: {
                  start: this.minutesToTime(depotTimeWindow[0]),
                  end: this.minutesToTime(depotTimeWindow[1])
                }              
              };
            } else {
              // Middle depot stop (shouldn't happen in normal routes)
              const arrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
              
              return {
                locationId: 'depot',
                address: typeof request.depotAddress === 'string' 
                ? request.depotAddress 
                : request.depotAddress.address,
                arrivalTime: this.minutesToTime(arrivalTime),
                departureTime: this.minutesToTime(arrivalTime),
                timeWindow: {
                  start: this.minutesToTime(depotTimeWindow[0]),
                  end: this.minutesToTime(depotTimeWindow[1])
                }              
              };
            }
          } else {
            // Delivery location (merged)
            const delivery = mergedDeliveries[nodeIndex - 1];
            // The solver's arrival time includes service time from previous stops
            // We need to calculate the actual arrival time (without service time at this stop)
            const solverArrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
            const actualArrivalTime = solverArrivalTime - serviceTimeMinutes; // Subtract service time to get actual arrival
            const departureTime = actualArrivalTime + serviceTimeMinutes; // Add service time for departure
            
            // Create orders array from original delivery data
            const orders = delivery.originalDeliveries?.map((originalDelivery: any) => ({
              id: originalDelivery.id,
              customer_name: originalDelivery.customer_name || originalDelivery.shipping_name || 'Unknown',
              order_number: originalDelivery.order_number || 'N/A',
              status: originalDelivery.order_status || originalDelivery.status || 'Unknown',
              address_1: originalDelivery.address_1 || originalDelivery.shipping_address1,
              city: originalDelivery.city || originalDelivery.shipping_city,
              zip: originalDelivery.zip || originalDelivery.shipping_zip,
              priority_start_time: originalDelivery.priority_start_time,
              priority_end_time: originalDelivery.priority_end_time
            })) || [];
            
            return {
              locationId: delivery.id,
              address: delivery.address,
              arrivalTime: this.minutesToTime(actualArrivalTime),
              departureTime: this.minutesToTime(departureTime),
              timeWindow: delivery.timeWindow,
              deliveryIds: delivery.deliveryIds, // include all merged delivery IDs
              orders: orders // include the orders array
            };
          }
        });
        return {
          vehicleId: solverRoute.vehicle_id + 1,
          stops,
          departureTime: this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime, serviceTimeSeconds),
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

        // Route stored
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

  private calculateDepartureTime(route: any, timeMatrix: number[][], customStartTime?: { date: string; time: string; minutesFromMidnight: number }, serviceTimeSeconds: number = 600): string {
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
    const departureTimeSeconds = arrivalTimeAtFirstDelivery - travelTimeOnly - serviceTimeSeconds; // Subtract travel time and service time
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
    serviceTimeMinutes?: number;
    locationId?: string;
    userContext?: {
      sessionId: string;
      userId: string;
      companyId: string;
      employeeId: string;
    };
  }): Promise<DeliveryResult> {
    try {
      // Optimizing routes from database

      // Step 1: Get real deliveries from Supabase using the same filtering logic as GET /api/delivery/deliveries-by-date
      // If a specific date is provided, use the same logic as the deliveries-by-date endpoint
      let deliveries: any[];
      if (params.fromDate && params.toDate && params.fromDate === params.toDate) {
        // Single date - use the same logic as deliveries-by-date endpoint
        // Using single date filtering
        
        // Require user context for single date filtering
        if (!params.userContext) {
          throw new Error('Authentication required for single date filtering');
        }
        
        deliveries = await this.getDeliveriesForDate(params.fromDate, params.limit || 200, params.userContext, params.status, params.locationId);
      } else {
        // Date range or other criteria - use the original logic but with consistent status
        // Using date range filtering
        
        // Sync with user context if available
        if (params.userContext) {
          await this.syncDeliveriesFromQuickFlora({
            fromDate: params.fromDate,
            toDate: params.toDate,
            status: params.status || 'Booked',
            limit: params.limit || 200,
            userContext: params.userContext,
            locationId: params.locationId
          });
        }
        
        // Fetch from Supabase
        deliveries = await this.supabaseService.getDeliveries({
          fromDate: params.fromDate,
          toDate: params.toDate,
          status: params.status || 'Booked', // Use provided status or default to 'Booked'
          limit: params.limit || 200, // Use same default limit as pending endpoint
          offset: params.offset || 0,
          companyId: params.userContext?.companyId, // Filter by company if user context available
          locationId: params.locationId
        });
      }

      if (deliveries.length === 0) {
        throw new Error('No deliveries found for the specified criteria');
      }

      // Found deliveries to optimize

      // Step 2: Get depot address (shop location) - use locationId as city if available
      const shopLocation = await this.supabaseService.getShopLocation(
        params.userContext?.companyId, 
        params.locationId // Use locationId as city parameter
      );
      const depotAddress = params.depotAddress || shopLocation;

      // Step 3: Convert deliveries to optimization format
      const deliveryLocations: DeliveryLocation[] = deliveries.map((delivery, index) => {
        // Handle time windows from database format
        let startTime = delivery.priority_start_time || '09:00';
        let endTime = delivery.priority_end_time || '17:00';
        
        // If start and end times are the same, it means "any time during the day" (no priority window)
        if (startTime === endTime) {
          startTime = '07:00'; // Start of business day
          endTime = '23:59';   // End of day
        }
        
        return {
          id: delivery.id.toString(),
          address: this.supabaseService.formatDeliveryAddress(delivery),
          timeWindow: {
            start: startTime,
            end: endTime
          },
          originalDelivery: delivery // Store the original delivery data
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
        vehicleCapacities: params.vehicleCapacities || [50],
        serviceTimeMinutes: params.serviceTimeMinutes || 10
      };

      // Step 6: Handle clustering internally based on delivery count
      let result: DeliveryResult;
      if (deliveryLocations.length > 24) {
        // Large delivery set - using clustering
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
          // Optimizing cluster
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
            vehicleCapacities: params.vehicleCapacities || [50],
            serviceTimeMinutes: params.serviceTimeMinutes || 10
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
        // Small delivery set - using direct optimization
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
        console.warn('Failed to get traffic-aware ETA:', err);
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

        // Database route stored
      } catch (storageError) {
        console.warn('Failed to store database route:', storageError);
        // Don't fail the optimization if storage fails
      }

      return result;

    } catch (error) {
      console.error('Error optimizing delivery routes from database:', error);
      throw error;
    }
  }


} 