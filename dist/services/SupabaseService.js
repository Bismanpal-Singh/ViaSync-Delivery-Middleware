"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class SupabaseService {
    constructor(config) {
        this.cachedShopLocation = null;
        this.cacheExpiry = 0;
        this.CACHE_DURATION = 5 * 60 * 1000;
        this.supabase = (0, supabase_js_1.createClient)(config.url, config.key);
    }
    async getDeliveries(params) {
        try {
            console.log('📦 Fetching deliveries from Supabase...');
            let query = this.supabase
                .from('deliveries')
                .select('*')
                .order('delivery_date', { ascending: false });
            if (params.fromDate) {
                query = query.gte('delivery_date', params.fromDate);
            }
            if (params.toDate) {
                query = query.lte('delivery_date', params.toDate);
            }
            if (params.status) {
                query = query.eq('status', params.status);
            }
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
        }
        catch (error) {
            console.error('❌ Failed to fetch deliveries from Supabase:', error);
            throw new Error('Failed to fetch deliveries from database');
        }
    }
    async getDeliveriesForQuotes(params) {
        try {
            const statusFilter = params.status || 'Booked,Pending,Confirmed';
            const statuses = statusFilter.split(',');
            let query = this.supabase
                .from('deliveries')
                .select('*')
                .in('status', statuses)
                .order('delivery_date', { ascending: false });
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
            const shopLocation = await this.getShopLocation();
            const deliveriesForQuotes = (data || []).map(delivery => ({
                delivery,
                pickupLocation: shopLocation,
                deliveryLocation: this.formatDeliveryAddress(delivery),
            }));
            console.log(`📋 Found ${deliveriesForQuotes.length} deliveries needing quotes`);
            return deliveriesForQuotes;
        }
        catch (error) {
            console.error('❌ Failed to get deliveries for quotes:', error);
            throw new Error('Failed to get deliveries for quotes');
        }
    }
    async getDeliveryById(deliveryId) {
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
        }
        catch (error) {
            console.error(`❌ Failed to fetch delivery ${deliveryId}:`, error);
            throw new Error('Failed to fetch delivery from database');
        }
    }
    async getDeliveriesByCustomer(customerName) {
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
        }
        catch (error) {
            console.error('❌ Failed to fetch customer deliveries:', error);
            throw new Error('Failed to fetch customer deliveries');
        }
    }
    async getRecentDeliveries(limit = 10) {
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
        }
        catch (error) {
            console.error('❌ Failed to fetch recent deliveries:', error);
            throw new Error('Failed to fetch recent deliveries');
        }
    }
    async getShopLocation() {
        try {
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
            this.cachedShopLocation = data;
            this.cacheExpiry = Date.now() + this.CACHE_DURATION;
            const formattedAddress = this.formatShopAddress(data);
            console.log(`✅ Retrieved shop location: ${formattedAddress}`);
            return formattedAddress;
        }
        catch (error) {
            console.error('❌ Failed to fetch shop location:', error);
            return process.env.SHOP_ADDRESS || '456 Flower Shop, San Francisco, CA 94103';
        }
    }
    async getCompanyLocations() {
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
        }
        catch (error) {
            console.error('❌ Failed to fetch company locations:', error);
            throw new Error('Failed to fetch company locations');
        }
    }
    formatShopAddress(location) {
        const shopName = location.location_name?.trim() || 'Flower Shop';
        const address = location.address?.trim() || '';
        const city = location.city?.trim() || '';
        const state = location.state?.trim() || '';
        const zip = location.zip_code?.trim() || '';
        if (address && city && state && zip) {
            return `${shopName}, ${address}, ${city}, ${state} ${zip}`;
        }
        else if (address && city && state) {
            return `${shopName}, ${address}, ${city}, ${state}`;
        }
        else if (address && city) {
            return `${shopName}, ${address}, ${city}`;
        }
        else if (address) {
            return `${shopName}, ${address}`;
        }
        return shopName;
    }
    formatDeliveryAddress(delivery) {
        const address = delivery.address_1?.trim() || '';
        const city = delivery.city?.trim() || '';
        const zip = delivery.zip?.trim() || '';
        if (address && city && zip) {
            return `${address}, ${city}, ${zip}`;
        }
        else if (address && city) {
            return `${address}, ${city}`;
        }
        else if (address) {
            return address;
        }
        return 'Address not available';
    }
    extractUniqueDeliveryLocations(deliveries) {
        const locations = new Set();
        deliveries.forEach(delivery => {
            const address = this.formatDeliveryAddress(delivery);
            if (address && address !== 'Address not available') {
                locations.add(address);
            }
        });
        return Array.from(locations);
    }
    async updateDeliveryStatus(deliveryId, status) {
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
        }
        catch (error) {
            console.error('❌ Failed to update delivery status:', error);
            throw new Error('Failed to update delivery status');
        }
    }
}
exports.SupabaseService = SupabaseService;
//# sourceMappingURL=SupabaseService.js.map