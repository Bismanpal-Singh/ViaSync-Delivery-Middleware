export interface VRPTWData {
    num_vehicles: number;
    depot: number;
    distance_matrix: number[][];
    time_matrix: number[][];
    time_windows: [number, number][];
    demands?: number[];
}
export interface VRPTWResult {
    routes?: Array<{
        vehicle_id: number;
        route: number[];
        arrival_times?: number[];
        distance: number;
        time: number;
        deliveries: number[];
    }>;
    total_distance?: number;
    total_time?: number;
    num_vehicles_used?: number;
    error?: string;
}
export declare class OrToolsService {
    private readonly solverPath;
    constructor();
    solveVRPTW(data: VRPTWData): Promise<VRPTWResult>;
}
//# sourceMappingURL=OrToolsService.d.ts.map