export interface DeliveryLocation {
    id: string;
    address: string;
    timeWindow: {
        start: string;
        end: string;
    };
}
export interface DeliveryRequest {
    depotAddress: string | {
        address: string;
        timeWindow?: {
            start: string;
            end: string;
        };
    };
    deliveries: DeliveryLocation[];
    numVehicles: number;
}
export interface DeliveryRoute {
    vehicleId: number;
    stops: Array<{
        locationId: string;
        address: string;
        eta: string;
        timeWindow: {
            start: string;
            end: string;
        };
    }>;
    departureTime: string;
    totalDistance: number;
    totalTime: number;
}
export interface DeliveryResult {
    routes: DeliveryRoute[];
    totalDistance: number;
    totalTime: number;
    numVehiclesUsed: number;
    warnings?: string[];
}
export declare class DeliveryService {
    private supabaseService;
    private distanceMatrixService;
    private geocodingService;
    private orToolsService;
    private routeStorageService;
    constructor();
    private timeToMinutes;
    private minutesToTime;
    private getCustomStartTime;
    private calculateRoughDistance;
    private toRadians;
    private calculateTimeCompatibilityScore;
    private clusterDeliveriesForOptimization;
    private getOptimalDeliveryClusters;
    optimizeDeliveryRoutes(request: DeliveryRequest, customStartTime?: {
        date: string;
        time: string;
        minutesFromMidnight: number;
    }): Promise<DeliveryResult>;
    private calculateArrivalTime;
    private calculateDepartureTime;
    optimizeDeliveryRoutesFromDatabase(params: {
        fromDate?: string;
        toDate?: string;
        status?: string;
        numVehicles: number;
        depotAddress?: string;
        limit?: number;
        offset?: number;
        startDate?: string;
        startTime?: string;
    }): Promise<DeliveryResult>;
}
//# sourceMappingURL=DeliveryService.d.ts.map