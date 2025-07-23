import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Delivery {
  id: number;
  sl_no?: number;
  order_number?: string;
  trip_id?: string;
  trip_prn?: string;
  sorting_order?: number;
  pack_list?: string;
  ship_list?: string;
  delivery_date?: string;
  customer_name: string;
  address_1: string;
  city: string;
  zip: string;
  priority?: string;
  destination_type?: string;
  status?: string;
  map_link?: string;
  verified?: boolean;
  delivery_notes?: string;
  zone?: string;
  location_id?: string;
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
  route_optimization_id?: string;
  priority_start_time?: string;
  priority_end_time?: string;
  has_time_deadline?: boolean;
  deadline_priority_level?: number;
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
  }): Promise<Delivery[]> {
    try {
      console.log('📦 Fetching deliveries from Supabase...');
      
      let query = this.supabase
        .from('deliveries')
        .select('*')
        .order('delivery_date', { ascending: false });

      // Apply date filters if provided
      if (params.fromDate) {
        query = query.gte('delivery_date', params.fromDate);
      }
      if (params.toDate) {
        query = query.lte('delivery_date', params.toDate);
      }

      // Apply status filter if provided
      if (params.status) {
        if (params.status.includes(',')) {
          const statuses = params.status.split(',').map(s => s.trim());
          query = query.in('status', statuses);
        } else {
          query = query.eq('status', params.status);
        }
      }

      // Apply pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, (params.offset + (params.limit || 10)) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch deliveries: ${error.message}`);
      }

      console.log(`✅ Retrieved ${data?.length || 0} deliveries from Supabase`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch deliveries from Supabase:', error);
      throw new Error('Failed to fetch deliveries from database');
    }
  }

  async getDeliveriesForQuotes(params: {
    fromDate?: string;
    toDate?: string;
    status?: string;
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
        .from('deliveries')
        .select('*')
        .in('status', statuses)
        .order('delivery_date', { ascending: false });

      // Apply date filters
      if (params.fromDate) {
        query = query.gte('delivery_date', params.fromDate);
      }
      if (params.toDate) {
        query = query.lte('delivery_date', params.toDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch deliveries for quotes: ${error.message}`);
      }

      // Get shop location for pickup
      const shopLocation = await this.getShopLocation();

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
      console.log(`📦 Fetching delivery ${deliveryId} from Supabase...`);
      
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
      console.log(`📦 Fetching deliveries for customer ${customerName}...`);
      
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
      console.log(`📦 Fetching ${limit} recent deliveries...`);
      
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
  async getShopLocation(): Promise<string> {
    try {
      // Check if we have a cached location that's still valid
      if (this.cachedShopLocation && Date.now() < this.cacheExpiry) {
        return this.formatShopAddress(this.cachedShopLocation);
      }

      console.log('🏪 Fetching shop location from company_locations...');
      
      const { data, error } = await this.supabase
        .from('company_locations')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn('⚠️ No active company location found, using fallback address');
          return process.env.SHOP_ADDRESS || '456 Flower Shop, San Francisco, CA 94103';
        }
        console.error('❌ Supabase query error:', error);
        throw new Error(`Failed to fetch shop location: ${error.message}`);
      }

      // Cache the location
      this.cachedShopLocation = data;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      const formattedAddress = this.formatShopAddress(data);
      console.log(`✅ Retrieved shop location: ${formattedAddress}`);
      return formattedAddress;
    } catch (error) {
      console.error('❌ Failed to fetch shop location:', error);
      // Return fallback address if database query fails
      return process.env.SHOP_ADDRESS || '456 Flower Shop, San Francisco, CA 94103';
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

  // Helper method to format delivery address from address_1, city, zip
  formatDeliveryAddress(delivery: Delivery): string {
    const address = delivery.address_1?.trim() || '';
    const city = delivery.city?.trim() || '';
    const zip = delivery.zip?.trim() || '';
    
    if (address && city && zip) {
      return `${address}, ${city}, ${zip}`;
    } else if (address && city) {
      return `${address}, ${city}`;
    } else if (address) {
      return address;
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
} 