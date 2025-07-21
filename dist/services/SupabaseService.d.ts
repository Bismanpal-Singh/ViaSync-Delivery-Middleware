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
export declare class SupabaseService {
    private supabase;
    private cachedShopLocation;
    private cacheExpiry;
    private readonly CACHE_DURATION;
    constructor(config: SupabaseConfig);
    getDeliveries(params: {
        fromDate?: string;
        toDate?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<Delivery[]>;
    getDeliveriesForQuotes(params: {
        fromDate?: string;
        toDate?: string;
        status?: string;
    }): Promise<Array<{
        delivery: Delivery;
        pickupLocation: string;
        deliveryLocation: string;
    }>>;
    getDeliveryById(deliveryId: number): Promise<Delivery | null>;
    getDeliveriesByCustomer(customerName: string): Promise<Delivery[]>;
    getRecentDeliveries(limit?: number): Promise<Delivery[]>;
    getShopLocation(): Promise<string>;
    getCompanyLocations(): Promise<CompanyLocation[]>;
    formatShopAddress(location: CompanyLocation): string;
    formatDeliveryAddress(delivery: Delivery): string;
    extractUniqueDeliveryLocations(deliveries: Delivery[]): string[];
    updateDeliveryStatus(deliveryId: number, status: string): Promise<void>;
}
export {};
//# sourceMappingURL=SupabaseService.d.ts.map