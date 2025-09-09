import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Delivery {
  id: number;
  
  // QuickFlora API Fields
  row_number?: number;
  tid?: string;
  shipping_name?: string;
  assigned_to?: string;
  shipping_company?: string;
  order_number?: string;
  shipping_address1?: string;
  shipping_address2?: string;
  shipping_state?: string;
  shipping_city?: string;
  shipping_zip?: string;
  priority?: string;
  destination_type?: string;
  assigned?: boolean;
  order_ship_date?: string;
  ship_method_id?: string;
  trip_id?: string;
  not_delivered?: boolean;
  delivered?: boolean;
  order_type_id?: string;
  backordered?: boolean;
  shipped?: boolean;
  location_id?: string;
  transmit_to_delivery?: boolean;
  posted?: boolean;
  zone?: string;
  order_status?: string; // "Booked", "Invoiced", etc.
  show_route?: string;
  address_verified?: string;
  order_reviewed?: boolean;
  
  // Multi-tenancy
  company_id?: string;
  
  // Route Optimization Fields
  route_optimization_id?: string;
  priority_start_time?: string;
  priority_end_time?: string;
  has_time_deadline?: boolean;
  deadline_priority_level?: number;
  
  // System Fields
  created_at?: string;
  updated_at?: string;
  
  // Legacy fields for backward compatibility
  customer_name?: string; // Maps to shipping_name
  address_1?: string; // Maps to shipping_address1
  city?: string; // Maps to shipping_city
  zip?: string; // Maps to shipping_zip
  status?: string; // Maps to order_status
  delivery_date?: string; // Maps to order_ship_date
}

interface CompanyLocation {
  id: string;
  location_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  longitude?: string;
  latitude?: string;
  time_zone?: string;
  language?: string;
  currency?: string;
  website_platform?: string;
  website_url?: string;
  doordash_id?: string;
  uber_id?: string;
  lyft_id?: string;
  operating_hours: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  logo_url?: string;
}

interface SupabaseConfig {
  url: string;
  key: string;
}

export class SupabaseService {
  private supabase: SupabaseClient;
  private cachedShopLocation: CompanyLocation | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(config: SupabaseConfig) {
    this.supabase = createClient(config.url, config.key);
  }

  async getDeliveries(params: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    limit?: number;
    offset?: number;
    companyId?: string;
    locationId?: string;
  }): Promise<Delivery[]> {
    try {
      let query = this.supabase
        .from('quickflora_deliveries')
        .select('*')
        .order('order_ship_date', { ascending: false });

      // Apply date filters if provided (handle both date and datetime formats)
      if (params.fromDate) {
        // Convert date to start of day for comparison
        const fromDateTime = params.fromDate.includes('T') ? params.fromDate : `${params.fromDate}T00:00:00`;
        query = query.gte('order_ship_date', fromDateTime);
      }
      if (params.toDate) {
        // Convert date to end of day for comparison
        const toDateTime = params.toDate.includes('T') ? params.toDate : `${params.toDate}T23:59:59`;
        query = query.lte('order_ship_date', toDateTime);
      }

      // Apply status filter if provided
      if (params.status) {
        if (params.status.includes(',')) {
          const statuses = params.status.split(',').map(s => s.trim());
          query = query.in('order_status', statuses);
        } else {
        query = query.eq('order_status', params.status);
        }
      }

      // Apply company filter if provided (for multi-tenancy)
      if (params.companyId) {
        query = query.eq('company_id', params.companyId);
      }

      // Apply location filter if provided (e.g., Geneva, Elgin)
      if (params.locationId) {
        query = query.eq('location_id', params.locationId);
      }

      // Apply pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, (params.offset + (params.limit || 10)) - 1);
      }

      // Query parameters logged only in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Querying Supabase with params:`, {
          fromDate: params.fromDate,
          toDate: params.toDate,
          status: params.status,
          companyId: params.companyId,
          locationId: params.locationId,
          limit: params.limit
        });
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch deliveries: ${error.message}`);
      }

      // Record count and sample logged only in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 Query returned ${data?.length || 0} records`);
        if (data && data.length > 0) {
          console.log(`📝 First record sample:`, {
            order_number: data[0].order_number,
            order_ship_date: data[0].order_ship_date,
            company_id: data[0].company_id,
            order_status: data[0].order_status
          });
        }
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch deliveries from Supabase:', error);
      throw new Error('Failed to fetch deliveries from database');
    }
  }

  async getDeliveriesForQuotes(params: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    companyId?: string;
  }): Promise<Array<{
    delivery: Delivery;
    pickupLocation: string;
    deliveryLocation: string;
  }>> {
    try {
      // Get deliveries that need quotes (Booked, Pending, etc.)
      const statusFilter = params.status || 'Booked,Pending,Confirmed';
      const statuses = statusFilter.split(',');
      
      let query = this.supabase
        .from('quickflora_deliveries')
        .select('*')
        .in('order_status', statuses)
        .order('order_ship_date', { ascending: false });

      // Apply date filters
      if (params.fromDate) {
        query = query.gte('order_ship_date', params.fromDate);
      }
      if (params.toDate) {
        query = query.lte('order_ship_date', params.toDate);
      }

      // Apply company filter if provided
      if (params.companyId) {
        query = query.eq('company_id', params.companyId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch deliveries for quotes: ${error.message}`);
      }

      // Get shop location for pickup
      const shopLocation = await this.getShopLocation(params.companyId);

      const deliveriesForQuotes = (data || []).map(delivery => ({
        delivery,
        pickupLocation: shopLocation,
        deliveryLocation: this.formatDeliveryAddress(delivery),
      }));

      console.log(`📋 Found ${deliveriesForQuotes.length} deliveries needing quotes`);
      return deliveriesForQuotes;
    } catch (error) {
      console.error('❌ Failed to get deliveries for quotes:', error);
      throw new Error('Failed to get deliveries for quotes');
    }
  }

  async getDeliveryById(deliveryId: number): Promise<Delivery | null> {
    try {
      console.log(`Fetching delivery ${deliveryId} from Supabase...`);
      
      const { data, error } = await this.supabase
        .from('deliveries')
        .select('*')
        .eq('id', deliveryId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`❌ Delivery ${deliveryId} not found`);
          return null;
        }
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch delivery: ${error.message}`);
      }

      console.log(`✅ Retrieved delivery ${deliveryId} from Supabase`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to fetch delivery ${deliveryId}:`, error);
      throw new Error('Failed to fetch delivery from database');
    }
  }

  async getDeliveriesByCustomer(customerName: string): Promise<Delivery[]> {
    try {
      console.log(`Fetching deliveries for customer ${customerName}...`);
      
      const { data, error } = await this.supabase
        .from('deliveries')
        .select('*')
        .ilike('customer_name', `%${customerName}%`)
        .order('delivery_date', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch customer deliveries: ${error.message}`);
      }

      console.log(`✅ Retrieved ${data?.length || 0} deliveries for customer ${customerName}`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch customer deliveries:', error);
      throw new Error('Failed to fetch customer deliveries');
    }
  }

  async getRecentDeliveries(limit: number = 10): Promise<Delivery[]> {
    try {
      console.log(`Fetching ${limit} recent deliveries...`);
      
      const { data, error } = await this.supabase
        .from('deliveries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch recent deliveries: ${error.message}`);
      }

      console.log(`✅ Retrieved ${data?.length || 0} recent deliveries`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch recent deliveries:', error);
      throw new Error('Failed to fetch recent deliveries');
    }
  }

  // Method to get shop location from company_locations table
  async getShopLocation(companyId?: string, city?: string): Promise<string> {
    const fallbackAddress = 'Town & Country Gardens Geneva, 216 W State St, Geneva, IL 60134';
    
    try {
      if (!companyId) {
        console.warn('⚠️ No companyId provided, using fallback address');
        return fallbackAddress;
      }


      
      let query = this.supabase
        .from('company_locations')
        .select('*')
        .eq('location_name', companyId) // Use location_name to store company_id
        .eq('is_active', true);

      // If city is specified, filter by city column
      if (city) {
        query = query.eq('city', city);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1);

      if (error) {
        console.error('❌ Error fetching company location:', error);
        console.log(`❌ Using fallback due to schema error: ${fallbackAddress}`);
        return fallbackAddress;
      }

              if (data && data.length > 0) {
          const location = data[0];
                  const fullAddress = this.formatShopAddress(location);
        return fullAddress;
        } else {
  
          return fallbackAddress;
        }
    } catch (error) {
      console.error('❌ Error in getShopLocation:', error);

      return fallbackAddress;
    }
  }

  // Method to get all company locations (useful for debugging)
  async getCompanyLocations(): Promise<CompanyLocation[]> {
    try {
      console.log('🏪 Fetching all company locations...');
      
      const { data, error } = await this.supabase
        .from('company_locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch company locations: ${error.message}`);
      }

      console.log(`✅ Retrieved ${data?.length || 0} company locations`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch company locations:', error);
      throw new Error('Failed to fetch company locations');
    }
  }

  // Helper method to format shop address with shop name
  formatShopAddress(location: CompanyLocation): string {
    const shopName = location.location_name?.trim() || 'Flower Shop';
    const address = location.address?.trim() || '';
    const city = location.city?.trim() || '';
    const state = location.state?.trim() || '';
    const zip = location.zip_code?.trim() || '';
    
    if (address && city && state && zip) {
      return `${shopName}, ${address}, ${city}, ${state} ${zip}`;
    } else if (address && city && state) {
      return `${shopName}, ${address}, ${city}, ${state}`;
    } else if (address && city) {
      return `${shopName}, ${address}, ${city}`;
    } else if (address) {
      return `${shopName}, ${address}`;
    }
    
    return shopName;
  }

  // Helper method to format delivery address from shipping fields
  formatDeliveryAddress(delivery: Delivery): string {
    // Use new field names if available, fall back to legacy fields
    const address1 = delivery.shipping_address1 || delivery.address_1;
    const address2 = delivery.shipping_address2;
    const city = delivery.shipping_city || delivery.city;
    const state = delivery.shipping_state;
    const zip = delivery.shipping_zip || delivery.zip;
    
    const addressParts = [address1, address2, city, state, zip].filter(Boolean);
    
    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
    
    return 'Address not available';
  }

  // Helper method to extract unique delivery locations
  extractUniqueDeliveryLocations(deliveries: Delivery[]): string[] {
    const locations = new Set<string>();
    
    deliveries.forEach(delivery => {
      const address = this.formatDeliveryAddress(delivery);
      if (address && address !== 'Address not available') {
        locations.add(address);
      }
    });

    return Array.from(locations);
  }

  // Method to update delivery status
  async updateDeliveryStatus(deliveryId: number, status: string): Promise<void> {
    try {
      console.log(`📝 Updating delivery ${deliveryId} status to ${status}...`);
      
      const { error } = await this.supabase
        .from('deliveries')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (error) {
        console.error('❌ Supabase update error:', error);
        throw new Error(`Failed to update delivery status: ${error.message}`);
      }

      console.log(`✅ Updated delivery ${deliveryId} status to ${status}`);
    } catch (error) {
      console.error('❌ Failed to update delivery status:', error);
      throw new Error('Failed to update delivery status');
    }
  }

  /**
   * Update order status for multiple deliveries (for trip sheet generation)
   */
  async updateOrderStatus(orderIds: string[], newStatus: string): Promise<{ updated: number, failed: number, records?: { id: number; order_number: string; order_status: string }[] }> {
    try {
      console.log(`📝 Updating status for ${orderIds.length} orders to "${newStatus}"...`);
      
      // Convert string IDs to integers since the database id field is an integer
      const numericOrderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      
      const { data, error } = await this.supabase
        .from('quickflora_deliveries')
        .update({ 
          order_status: newStatus,
          // Keep legacy column in sync for any consumers still reading `status`
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .in('id', numericOrderIds)
        .select();

      if (error) {
        console.error('❌ Supabase update error:', error);
        throw new Error(`Failed to update order statuses: ${error.message}`);
      }

      // Use data.length instead of count since count can be null
      const successfulCount = data?.length || 0;
      console.log(`✅ Updated ${successfulCount} orders to "${newStatus}"`);
      
      // Verify the updates persisted by re-reading the records (development only)
      if (process.env.NODE_ENV === 'development') {
        const { data: verifyRecords, error: verifyError } = await this.supabase
          .from('quickflora_deliveries')
          .select('id, order_number, order_status')
          .in('id', numericOrderIds);

        if (!verifyError && verifyRecords) {
          console.log(`🔍 Verification after update:`);
          verifyRecords.forEach(record => {
            console.log(`  - ID: ${record.id}, Order: ${record.order_number}, Status: ${record.order_status}`);
          });
        }
      }
      
      return { 
        updated: successfulCount, 
        failed: orderIds.length - successfulCount,
        records: []
      };
    } catch (error) {
      console.error('❌ Failed to update order statuses:', error);
      throw new Error('Failed to update order statuses');
    }
  }

  /**
   * Syncs delivery data from QuickFlora API to Supabase database.
   * Performs an upsert operation to add new deliveries and update existing ones.
   */
  async syncWithQuickFlora(deliveries: any[], companyId?: string): Promise<{ added: number, updated: number, failed: number }> {
    if (!deliveries || deliveries.length === 0) {
      return { added: 0, updated: 0, failed: 0 };
    }

    // Preserve locally-updated statuses like "Routed" by checking existing records first
    let existingStatusByOrderNumber: Record<string, string> = {};
    try {
      const orderNumbers = deliveries
        .map(d => d.OrderNumber)
        .filter((n: any) => typeof n === 'string' || typeof n === 'number');
      if (orderNumbers.length > 0) {
        const { data: existingRows } = await this.supabase
          .from('quickflora_deliveries')
          .select('order_number, order_status')
          .in('order_number', orderNumbers)
          .eq('company_id', companyId || '');
        if (Array.isArray(existingRows)) {
          existingRows.forEach((row: any) => {
            if (row && row.order_number) existingStatusByOrderNumber[String(row.order_number)] = row.order_status || '';
          });
        }
      }
    } catch (_) {
      // Non-fatal - if this lookup fails, we still proceed with upsert
    }

    const recordsToUpsert = deliveries.map(d => {
      // Helper function to parse time windows like "08:00-17:00"
      const parseTimeWindow = (priority: string) => {
        if (priority && priority.includes('-')) {
          const [start, end] = priority.split('-');
          return { priority_start_time: start, priority_end_time: end };
        }
        return { priority_start_time: '09:00', priority_end_time: '17:00' }; // Default
      };

      const { priority_start_time, priority_end_time } = parseTimeWindow(d.Priority);
      
      // Create record with ALL fields from QuickFlora API response
      const record: any = {
        // QuickFlora API Fields - mapped exactly as returned
        row_number: d.rowNumber,
        tid: d.TID || '',
        shipping_name: (d.ShippingName && d.ShippingName.trim()) ? d.ShippingName.trim() : '',
        assigned_to: d.Assignedto || '',
        shipping_company: d.ShippingCompany || '',
        order_number: d.OrderNumber,
        shipping_address1: d.ShippingAddress1 || '',
        shipping_address2: d.ShippingAddress2 || '',
        shipping_state: d.ShippingState || '',
        shipping_city: d.ShippingCity || '',
        shipping_zip: d.ShippingZip || '',
        priority: d.Priority || '',
        destination_type: d.DestinationType || '',
        assigned: d.Assigned === 1 || d.Assigned === true,
        order_ship_date: d.OrderShipDate,
        ship_method_id: d.ShipMethodID || '',
        trip_id: (d.TripID && typeof d.TripID === 'string') ? d.TripID : '',
        not_delivered: d.NotDelivered === 1 || d.NotDelivered === true || false,
        delivered: d.Delivered === 1 || d.Delivered === true || false,
        order_type_id: d.OrderTypeID || '',
        backordered: d.Backordered === 1 || d.Backordered === true || false,
        shipped: d.Shipped === 1 || d.Shipped === true || false,
        location_id: d.LocationID || '',
        transmit_to_delivery: d.TransmitToDelivery === 1 || d.TransmitToDelivery === true || false,
        posted: d.Posted === 1 || d.Posted === true || false,
        zone: d.Zone || '',
        // If we already marked an order as Routed locally, don't let upstream overwrite it
        order_status: (existingStatusByOrderNumber[String(d.OrderNumber)] || '').toLowerCase() === 'routed'
          ? 'Routed'
          : (d.OrderStatus || ''),
        show_route: d.ShowRoute || '',
        address_verified: d.AddressVerified || '',
        order_reviewed: d.OrderReveiwed === 1 || d.OrderReveiwed === true || false,
        
        // Multi-tenancy
        company_id: companyId,
        
        // Route Optimization Fields (parsed from Priority)
        priority_start_time,
        priority_end_time,
        
        // Legacy fields for backward compatibility
        customer_name: (d.ShippingName && d.ShippingName.trim()) ? d.ShippingName.trim() : 'N/A',
        address_1: d.ShippingAddress1 || '',
        city: d.ShippingCity || '',
        zip: d.ShippingZip || '',
        delivery_date: d.OrderShipDate
      };

      return record;
    });

    // Debug: Log record structure only in development
    if (process.env.NODE_ENV === 'development' && recordsToUpsert.length > 0) {
      console.log('🔍 First record structure and field lengths:');
      const firstRecord = recordsToUpsert[0];
      Object.entries(firstRecord).forEach(([key, value]) => {
        const valueStr = value?.toString() || 'null';
        if (valueStr.length > 10) {
          console.log(`  ⚠️  ${key}: "${valueStr}" (${valueStr.length} chars)`);
        } else {
          console.log(`  ✅ ${key}: "${valueStr}" (${valueStr.length} chars)`);
        }
      });
    }

    const { data, error, count } = await this.supabase
      .from('quickflora_deliveries')
      .upsert(recordsToUpsert, {
        onConflict: 'order_number',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('❌ Supabase upsert error:', error);
      
      // Check if this is the VARCHAR constraint error
      if (error.code === '22001') {
        console.error('🚨 VARCHAR constraint error! Some database fields are still too small.');
        console.error('💡 Run this SQL in Supabase to check remaining VARCHAR(10) fields:');
        console.error('SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = \'quickflora_deliveries\' AND character_maximum_length = 10;');
        
        // Log more details about the constraint error
        console.log('📦 Database constraint error - need to fix field mappings');
      }
      
      return { added: 0, updated: 0, failed: deliveries.length };
    }
    
    const successfulCount = data?.length || count || 0;
    console.log(`✅ Successfully upserted ${successfulCount} records to Supabase`);
    console.log(`📝 Response data length: ${data?.length || 0}, Count: ${count}`);
    
    return { added: successfulCount, updated: 0, failed: deliveries.length - successfulCount };
  }
} 