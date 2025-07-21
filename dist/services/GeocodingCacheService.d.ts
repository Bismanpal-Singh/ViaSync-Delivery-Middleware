interface GeocodingCache {
    address: string;
    lat: number;
    lon: number;
    formatted_address: string;
    created_at: string;
}
export declare class GeocodingCacheService {
    private db;
    private dbPath;
    constructor();
    private initDatabase;
    private createTable;
    getCachedGeocoding(address: string): Promise<GeocodingCache | null>;
    cacheGeocoding(address: string, lat: number, lon: number, formattedAddress: string): Promise<void>;
    clearOldCache(daysOld?: number): Promise<void>;
    getCacheStats(): Promise<{
        total: number;
        oldest: string;
        newest: string;
    }>;
    close(): void;
}
export {};
//# sourceMappingURL=GeocodingCacheService.d.ts.map