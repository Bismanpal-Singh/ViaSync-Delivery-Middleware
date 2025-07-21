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
export declare class DistanceMatrixService {
    private readonly apiKey;
    private readonly baseUrl;
    constructor();
    getDistanceMatrix(locations: Location[]): Promise<DistanceMatrixResult | null>;
    private estimateFallbackDistance;
    private haversine;
    private toRadians;
}
export {};
//# sourceMappingURL=DistanceMatrixService.d.ts.map