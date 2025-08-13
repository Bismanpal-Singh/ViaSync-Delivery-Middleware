import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TripSheet {
  id: string;
  tripSheetName: string;
  driverName: string;
  vehicleName: string;
  deliveryDate: string;
  startTime: string;
  depotAddress: string;
  totalStops: number;
  completedStops: number;
  status: string;
  orders: any[];
  optimizationResult: {
    routes: any[];
    totalDistance: number;
    totalTime: number;
  };
  createdAt: string;
  updatedAt: string;
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
      
      return !error;
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
    
    const startTime = params.startTime || '08:00';
    const endTime = this.calculateEndTime(startTime, params.optimizationResult.totalTime);

    const tripSheetData = {
      id: tripSheetId,
      driver: params.driverName || 'Unassigned',
      vehicle: params.vehicleName || `Vehicle-${params.vehicleCapacities.length > 1 ? 'Multi' : '01'}`,
      start_time: startTime,
      estimated_end: endTime,
      total_stops: this.countTotalStops(params.optimizationResult.routes),
      completed_stops: 0,
      current_mileage: Math.round(params.optimizationResult.totalDistance / 1609.34),
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
   * Get trip sheet by ID
   */
  async getTripSheet(tripSheetId: string): Promise<TripSheet | null> {
    const { data: tripSheet, error: sheetError } = await this.supabase
      .from('trip_sheets')
      .select('*')
      .eq('id', tripSheetId)
      .single();

    if (sheetError || !tripSheet) return null;

    return this.formatTripSheet(tripSheet);
  }

  /**
   * Get all active trip sheets
   */
  async getActiveTripSheets(companyId: string): Promise<TripSheet[]> {
    const { data: tripSheets, error } = await this.supabase
      .from('trip_sheets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get trip sheets: ${error.message}`);

    return (tripSheets || []).map(tripSheet => this.formatTripSheet(tripSheet));
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
      .gte('route_date', params.startDate)
      .lte('route_date', params.endDate)
      .order('route_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get trip sheets: ${error.message}`);

    return (data || []).map(tripSheet => this.formatTripSheet(tripSheet));
  }

  /**
   * Get trip sheets by specific date
   */
  async getTripSheetsByDate(params: {
    companyId: string;
    date: string;
  }): Promise<TripSheet[]> {
    const { data: tripSheets, error } = await this.supabase
      .from('trip_sheets')
      .select('*')
      .eq('route_date', params.date)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get trip sheets: ${error.message}`);
    }

    return (tripSheets || []).map(tripSheet => this.formatTripSheet(tripSheet));
  }

  /**
   * Format trip sheet data for frontend
   */
  private formatTripSheet(tripSheet: any): TripSheet {
    const orders = tripSheet.orders || [];
    const completedStops = tripSheet.completed_stops || 0;

    const formattedOrders = orders.map((order: any, index: number) => ({
      id: order.orderId || `order-${index}`,
      customer: order.customerName || 'Unknown',
      address: order.address || 'Address not available',
      city: order.city || '',
      zip: order.zip || '',
      status: order.status || 'pending',
      priority: order.priority || 'standard',
      orderNumber: order.orderNumber || `ORDER-${index}`,
      stopOrder: order.stopOrder || index + 1,
      estimatedArrivalTime: order.estimatedArrival || '',
      estimatedDepartureTime: order.estimatedDeparture || ''
    }));

    return {
      id: tripSheet.id,
      tripSheetName: `Trip Sheet ${tripSheet.id}`,
      driverName: tripSheet.driver || 'Unassigned',
      vehicleName: tripSheet.vehicle || 'Unassigned',
      deliveryDate: tripSheet.route_date,
      startTime: tripSheet.start_time || '08:00',
      depotAddress: 'GTS Flowers Inc, 8002 Concord Hwy, Monroe, NC 28110',
      totalStops: tripSheet.total_stops || orders.length,
      completedStops: completedStops,
      status: 'active',
      orders: formattedOrders,
      optimizationResult: {
        routes: tripSheet.orders || [],
        totalDistance: tripSheet.current_mileage ? tripSheet.current_mileage * 1609.34 : 0,
        totalTime: this.calculateTotalTime(tripSheet.start_time, tripSheet.estimated_end)
      },
      createdAt: tripSheet.created_at,
      updatedAt: tripSheet.updated_at
    };
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

  private formatOrdersForTripSheet(routes: any[]): any[] {
    const orders: any[] = [];

    routes.forEach((route, routeIndex) => {
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach((stop: any, stopIndex: number) => {
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

  private calculateTotalTime(startTime: string, endTime: string): number {
    if (!startTime || !endTime) return 0;
    
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    return endTotalMinutes - startTotalMinutes;
  }
}
