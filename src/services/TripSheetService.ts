import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TripSheet {
  id: string;
  driver: string;
  vehicle: string;
  startTime: string;
  estimatedEnd: string;
  totalStops: number;
  completedStops: number;
  currentMileage: number;
  dispatcher: string;
  routeDate: string;
  mileage: string;
  orders: any[];
  createdAt: string;
  updatedAt: string;
}

export interface TripSheetOrder {
  id: string;
  tripSheetId: string;
  deliveryId: number;
  stopOrder: number;
  vehicleId: number;
  estimatedArrivalTime: string;
  estimatedDepartureTime: string;
  delivery?: any; // Linked delivery data
}

export interface DeliveryResult {
  routes: any[];
  totalDistance: number;
  totalTime: number;
  totalLoad?: number;
  numVehiclesUsed: number;
}

export class TripSheetService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }

  /**
   * Test if trip_sheets table exists and is accessible
   */
  async testTableAccess(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('trip_sheets')
        .select('id')
        .limit(1);
      
      if (error) {
        return false;
      }
      
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Generate unique trip sheet ID
   */
  private generateTripSheetId(): string {
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const random = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
    return `${day}-${month}-${random}`;
  }

  /**
   * Generate trip sheet from optimized route
   */
  async generateTripSheet(params: {
    sheetName?: string;
    deliveryDate: string;
    vehicleCapacities: number[];
    startTime?: string;
    driverName?: string;
    vehicleName?: string;
    optimizationResult: DeliveryResult;
    companyId: string;
    createdBy: string;
  }): Promise<TripSheet> {
    const tripSheetId = this.generateTripSheetId();
    const sheetName = params.sheetName || `Trip Sheet ${tripSheetId}`;
    
    // Calculate time range
    const startTime = params.startTime || '08:00';
    const endTime = this.calculateEndTime(startTime, params.optimizationResult.totalTime);

    // Create trip sheet
    
    const tripSheetData = {
      id: tripSheetId,
      driver: params.driverName || 'Unassigned',
      vehicle: params.vehicleName || `Vehicle-${params.vehicleCapacities.length > 1 ? 'Multi' : '01'}`,
      start_time: startTime,
      estimated_end: endTime,
      total_stops: this.countTotalStops(params.optimizationResult.routes),
      completed_stops: 0,
      current_mileage: Math.round(params.optimizationResult.totalDistance / 1609.34), // Convert meters to miles
      dispatcher: params.createdBy,
      route_date: params.deliveryDate,
      mileage: `${Math.round(params.optimizationResult.totalDistance / 1609.34)} miles`,
      orders: this.formatOrdersForTripSheet(params.optimizationResult.routes)
    };
    
    const { data: tripSheet, error: sheetError } = await this.supabase
      .from('trip_sheets')
      .insert(tripSheetData)
      .select()
      .single();

    if (sheetError) {
      throw new Error(`Failed to create trip sheet: ${sheetError.message}`);
    }

    return tripSheet;
  }

  /**
   * Get trip sheet by ID with delivery details from existing deliveries table
   */
  async getTripSheet(tripSheetId: string): Promise<TripSheet | null> {
    const { data: tripSheet, error: sheetError } = await this.supabase
      .from('trip_sheets')
      .select('*')
      .eq('trip_sheet_id', tripSheetId)
      .single();

    if (sheetError || !tripSheet) return null;

    // Get trip sheet orders with delivery details
    const { data: orders, error: ordersError } = await this.supabase
      .from('trip_sheet_orders')
      .select(`
        *,
        deliveries (
          id,
          shipping_name,
          order_number,
          shipping_address1,
          shipping_address2,
          shipping_city,
          shipping_state,
          shipping_zip,
          order_status,
          priority,
          assigned_to
        )
      `)
      .eq('trip_sheet_id', tripSheet.id)
      .order('stop_order');

    if (ordersError) throw new Error(`Failed to get orders: ${ordersError.message}`);

    return {
      ...tripSheet,
      orders: orders || []
    };
  }

  /**
   * Get all active trip sheets for a company
   */
  async getActiveTripSheets(companyId: string): Promise<TripSheet[]> {
    const { data: tripSheets, error } = await this.supabase
      .from('trip_sheets')
      .select(`
        *,
        trip_sheet_orders (
          delivery_id,
          deliveries (order_status)
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get trip sheets: ${error.message}`);

    // Calculate completed stops for each trip sheet
    return (tripSheets || []).map(tripSheet => {
      const orders = tripSheet.trip_sheet_orders || [];
      const completedStops = orders.filter((order: any) => 
        order.deliveries?.order_status === 'delivered'
      ).length;

      return {
        ...tripSheet,
        completed_stops: completedStops,
        total_stops: orders.length
      };
    });
  }

  /**
   * Get trip sheets by date range
   */
  async getTripSheetsByDateRange(params: {
    companyId: string;
    startDate: string;
    endDate: string;
    status?: string;
  }): Promise<TripSheet[]> {
    let query = this.supabase
      .from('trip_sheets')
      .select('*')
      .eq('company_id', params.companyId)
      .gte('delivery_date', params.startDate)
      .lte('delivery_date', params.endDate)
      .order('delivery_date', { ascending: false });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get trip sheets: ${error.message}`);

    return data || [];
  }

  private async createTripSheetOrders(tripSheetId: string, routes: any[]): Promise<void> {
    let stopOrder = 1;

    for (const route of routes) {
      for (const stop of route.stops) {
        if (stop.locationId !== 'depot') {
          // Create trip sheet order
          const { error: orderError } = await this.supabase
            .from('trip_sheet_orders')
            .insert({
              trip_sheet_id: tripSheetId,
              delivery_id: parseInt(stop.locationId),
              stop_order: stopOrder++,
              vehicle_id: route.vehicleId,
              estimated_arrival_time: stop.arrivalTime,
              estimated_departure_time: stop.departureTime
            });

          if (orderError) throw new Error(`Failed to create trip sheet order: ${orderError.message}`);
        }
      }
    }


  }

  private countTotalStops(routes: any[]): number {
    return routes.reduce((total, route) => {
      return total + route.stops.filter((stop: any) => stop.locationId !== 'depot').length;
    }, 0);
  }

  private calculateEndTime(startTime: string, totalMinutes: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + totalMinutes;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  }

  /**
   * Format route orders for trip sheet storage
   */
    private formatOrdersForTripSheet(routes: any[]): any[] {
    const orders: any[] = [];

    routes.forEach((route, routeIndex) => {
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach((stop: any, stopIndex: number) => {
          // Check if this is a delivery stop (not depot)
          if (stop.locationId && stop.locationId !== 'depot') {
            orders.push({
              orderId: stop.locationId,
              stopOrder: stopIndex + 1,
              vehicleId: routeIndex + 1,
              address: stop.address || stop.location,
              estimatedArrival: stop.arrivalTime || stop.estimatedArrivalTime,
              customerName: stop.customerName || stop.shippingName || 'Unknown',
              orderNumber: stop.orderNumber || `ORDER-${stop.locationId}`,
              status: 'pending'
            });
          }
        });
      }
    });

    return orders;
  }
}
