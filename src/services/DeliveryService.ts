import { SupabaseService } from './SupabaseService';
import { DistanceMatrixService } from './DistanceMatrixService';
import { GeocodingService } from './GeocodingService';
import { OrToolsService, VRPTWData, VRPTWResult } from './OrToolsService';

interface Delivery {
  deliveryId: number;
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  deliveryDate: string;
  status: string;
  priority: string;
  latitude?: number;
  longitude?: number;
}

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
  totalDistance: number;
  totalTime: number;
}

export interface DeliveryResult {
  routes: DeliveryRoute[];
  totalDistance: number;
  totalTime: number;
  numVehiclesUsed: number;
  warnings?: string[];
}



interface DeliveryQuoteResponse {
  success: boolean;
  data: {
    deliveries: Delivery[];
    summary: {
      totalDeliveries: number;
      deliveriesWithQuotes: number;
      totalUberCost: number;
      averageUberCost: number;
    };
    timestamp: string;
  };
  message: string;
}

export class DeliveryService {
  private supabaseService: SupabaseService;
  private distanceMatrixService: DistanceMatrixService;
  private geocodingService: GeocodingService;
  private orToolsService: OrToolsService;

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

  async optimizeDeliveryRoutes(request: DeliveryRequest): Promise<DeliveryResult> {
    try {
      console.log(`🚚 Optimizing delivery routes for ${request.deliveries.length} deliveries with ${request.numVehicles} vehicles`);

      // Step 1: Geocode all addresses
      let depotAddressStr: string;
      let depotTimeWindow: [number, number] = [0, 1440]; // default full day

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
      
      const distanceMatrix = matrixResult.distances.map(row => row.map(d => d / 1000)); // Convert to km
      const timeMatrix = matrixResult.matrix.map(row => row.map(t => Math.round(t / 60))); // Convert to minutes

      // Debug: Print sample of distance and time matrices
      console.log('🧮 Distance matrix (km):', JSON.stringify(distanceMatrix, null, 2));
      console.log('⏱️ Time matrix (min):', JSON.stringify(timeMatrix, null, 2));

      // Step 3: Convert time windows to minutes from midnight
      const timeWindows: [number, number][] = [depotTimeWindow];

      for (const delivery of request.deliveries) {
        const startMinutes = this.timeToMinutes(delivery.timeWindow.start);
        const endMinutes = this.timeToMinutes(delivery.timeWindow.end);
        timeWindows.push([startMinutes, endMinutes]);
      }

      // Debug: Print time windows
      console.log('🕰️ Time windows (minutes from midnight):', JSON.stringify(timeWindows));

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

              eta: this.minutesToTime(0), // Start time
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
          totalDistance: solverRoute.distance,
          totalTime: solverRoute.time
        };
      });

      return {
        routes,
        totalDistance: solverResult.total_distance || 0,
        totalTime: solverResult.total_time || 0,
        numVehiclesUsed: solverResult.num_vehicles_used || routes.length
      };

    } catch (error) {
      console.error('Error optimizing delivery routes:', error);
      throw error;
    }
  }

  private calculateArrivalTime(route: any, stopIndex: number, timeMatrix: number[][]): number {
    // Calculate cumulative travel time to this stop
    let totalTime = 0;
    for (let i = 1; i <= stopIndex; i++) {
      const fromNode = route.route[i - 1];
      const toNode = route.route[i];
      totalTime += timeMatrix[fromNode][toNode];
    }
    return totalTime;
  }

  /**
   * Get delivery quotes (legacy method)
   */
  async getDeliveryQuotes(status?: string, limit?: number): Promise<DeliveryQuoteResponse> {
    try {
      console.log('📦 Fetching deliveries from database...');
      
      // Get deliveries from database
      const deliveries = await this.supabaseService.getDeliveries({
        status,
        limit
      });
      
      console.log(`✅ Found ${deliveries.length} deliveries`);
      
      // Format deliveries for response
      const formattedDeliveries: Delivery[] = deliveries.map(delivery => ({
        deliveryId: delivery.id,
        orderNumber: delivery.order_number || 'N/A',
        customerName: delivery.customer_name,
        deliveryAddress: this.supabaseService.formatDeliveryAddress(delivery),
        deliveryDate: delivery.delivery_date || 'N/A',
        status: delivery.status || 'Unknown',
        priority: delivery.priority || 'N/A'
      }));

      // Calculate summary
      const summary = {
        totalDeliveries: formattedDeliveries.length,
        deliveriesWithQuotes: 0, // No quotes available since Uber is disabled
        totalUberCost: 0,
        averageUberCost: 0
      };

      console.log('✅ Delivery quote retrieval completed successfully');
      console.log(`📊 Summary: ${summary.deliveriesWithQuotes}/${summary.totalDeliveries} deliveries have quotes`);
      console.log(`💰 Total Uber cost: $${summary.totalUberCost.toFixed(2)}`);

      return {
        success: true,
        data: {
          deliveries: formattedDeliveries,
          summary,
          timestamp: new Date().toISOString()
        },
        message: `Retrieved ${formattedDeliveries.length} delivery quotes`
      };
    } catch (error) {
      console.error('❌ Failed to get delivery quotes:', error);
      throw new Error('Failed to get delivery quotes');
    }
  }

  /**
   * Get raw deliveries (legacy method)
   */
  async getDeliveriesRaw(status?: string, limit?: number): Promise<any[]> {
    try {
      console.log('📦 Fetching raw deliveries from database...');
      
      // Get raw deliveries from database
      const deliveries = await this.supabaseService.getDeliveries({
        status,
        limit
      });
      
      console.log(`✅ Found ${deliveries.length} raw deliveries`);
      
      // Return raw delivery data without formatting
      return deliveries;
    } catch (error) {
      console.error('❌ Failed to get raw deliveries:', error);
      throw new Error('Failed to get raw deliveries');
    }
  }
} 