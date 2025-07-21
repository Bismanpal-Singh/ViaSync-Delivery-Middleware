interface GeocodingResult {
    lat: number;
    lon: number;
    address: string;
}
export declare class GeocodingService {
    private readonly apiKey;
    private readonly baseUrl;
    private cacheService;
    constructor();
    geocodeAddress(address: string): Promise<GeocodingResult | null>;
    geocodeAddresses(addresses: string[]): Promise<Map<string, GeocodingResult>>;
    getCacheStats(): Promise<{
        total: number;
        oldest: string;
        newest: string;
    }>;
    clearOldCache(daysOld?: number): Promise<void>;
    close(): void;
}
export {};
//# sourceMappingURL=GeocodingService.d.ts.map