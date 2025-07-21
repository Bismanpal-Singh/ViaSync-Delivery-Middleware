export interface StoredRoute {
    id: string;
    route_name: string;
    delivery_date: string;
    depot_address: string;
    num_vehicles: number;
    num_vehicles_used: number;
    total_distance: number;
    total_time: number;
    route_data: string;
    status: 'active' | 'completed' | 'cancelled';
    created_at: string;
    updated_at: string;
    assigned_driver?: string;
    driver_notes?: string;
    shop_notes?: string;
}
export interface RouteForDriver {
    routeId: string;
    routeName: string;
    deliveryDate: string;
    depotAddress: string;
    vehicleId: number;
    stops: Array<{
        locationId: string;
        address: string;
        eta: string;
        timeWindow: {
            start: string;
            end: string;
        };
        customerName?: string;
        orderNumber?: string;
        deliveryNotes?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    }>;
    totalDistance: number;
    totalTime: number;
    navigationData: {
        waypoints: Array<{
            address: string;
            coordinates: {
                lat: number;
                lng: number;
            };
        }>;
        polyline?: string;
    };
}
export interface RouteForShopOwner {
    routeId: string;
    routeName: string;
    deliveryDate: string;
    depotAddress: string;
    routes: Array<{
        vehicleId: number;
        driverName?: string;
        stops: Array<{
            locationId: string;
            address: string;
            eta: string;
            timeWindow: {
                start: string;
                end: string;
            };
            customerName?: string;
            orderNumber?: string;
            status: 'pending' | 'in_progress' | 'completed' | 'failed';
            deliveryNotes?: string;
        }>;
        totalDistance: number;
        totalTime: number;
        currentLocation?: {
            lat: number;
            lng: number;
        };
        estimatedReturnTime?: string;
    }>;
    summary: {
        totalDeliveries: number;
        totalDistance: number;
        totalTime: number;
        numVehiclesUsed: number;
        completedDeliveries: number;
        pendingDeliveries: number;
    };
    status: 'active' | 'completed' | 'cancelled';
    createdAt: string;
    updatedAt: string;
}
export declare class RouteStorageService {
    private db;
    private dbPath;
    constructor();
    private initDatabase;
    private createTables;
    storeRoute(routeData: {
        id: string;
        routeName: string;
        deliveryDate: string;
        depotAddress: string;
        numVehicles: number;
        numVehiclesUsed: number;
        totalDistance: number;
        totalTime: number;
        routes: any[];
        assignedDriver?: string;
    }): Promise<void>;
    getRouteForDriver(routeId: string, vehicleId: number): Promise<RouteForDriver | null>;
    getRouteForShopOwner(routeId: string): Promise<RouteForShopOwner | null>;
    updateDeliveryProgress(routeId: string, vehicleId: number, locationId: string, status: string, notes?: string): Promise<void>;
    updateDriverLocation(routeId: string, vehicleId: number, driverId: string, lat: number, lng: number, accuracy?: number): Promise<void>;
    getActiveRoutes(): Promise<StoredRoute[]>;
    getRoutesByDateRange(startDate: string, endDate: string): Promise<StoredRoute[]>;
    updateRouteStatus(routeId: string, status: 'active' | 'completed' | 'cancelled'): Promise<void>;
    private getVehicleProgress;
    private getAllProgress;
    private getLatestDriverLocations;
    private calculateReturnTime;
    private calculateSummary;
    close(): void;
}
//# sourceMappingURL=RouteStorageService.d.ts.map