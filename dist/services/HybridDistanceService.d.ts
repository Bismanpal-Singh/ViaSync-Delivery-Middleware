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
export declare class HybridDistanceService {
    private googleService;
    private osrmService;
    constructor();
    getDistanceMatrix(locations: Location[]): Promise<DistanceMatrixResult | null>;
    testServices(): Promise<{
        google: boolean;
        osrm: boolean;
    }>;
}
export {};
//# sourceMappingURL=HybridDistanceService.d.ts.map