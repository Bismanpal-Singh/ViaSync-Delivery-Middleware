interface Location {
    lat: number;
    lon: number;
    type: 'depot' | 'order';
    orderId?: number;
    timeWindowStart?: string;
    timeWindowEnd?: string;
}
interface DistanceMatrixResult {
    origins: string[];
    destinations: string[];
    matrix: number[][];
    distances: number[][];
}
export declare class OSRMService {
    private readonly baseUrl;
    constructor();
    getDistanceMatrix(locations: Location[]): Promise<DistanceMatrixResult | null>;
    testConnection(): Promise<boolean>;
}
export {};
//# sourceMappingURL=OSRMService.d.ts.map