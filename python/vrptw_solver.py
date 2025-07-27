#!/usr/bin/env python3

import json
import sys
from ortools.constraint_solver import routing_enums_pb2, pywrapcp


def create_data_model(input_data):
    """Create the data model for the VRPTW with capacity constraints."""
    return {
        "distance_matrix": input_data["distance_matrix"],
        "time_matrix": input_data["time_matrix"],
        "time_windows": input_data["time_windows"],
        "num_vehicles": input_data["num_vehicles"],
        "depot": input_data["depot"],
        "vehicle_capacities": input_data.get("vehicle_capacities", [1000] * input_data["num_vehicles"]),
        "demands": input_data.get("demands", [1] * len(input_data["distance_matrix"]))
    }


def solve_vrptw(data):
    print(f"🔍 Solver input: {len(data['distance_matrix'])} locations, {data['num_vehicles']} vehicles", file=sys.stderr)
    print(f"📦 Vehicle capacities: {data['vehicle_capacities']}", file=sys.stderr)
    print(f"📋 Demands: {data['demands']}", file=sys.stderr)
    print(f"📊 Total demand: {sum(data['demands'])}", file=sys.stderr)
    print(f"🚚 Total capacity: {sum(data['vehicle_capacities'])}", file=sys.stderr)
    
    manager = pywrapcp.RoutingIndexManager(
        len(data["distance_matrix"]),
        data["num_vehicles"],
        data["depot"]
    )

    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_idx, to_idx):
        f, t = manager.IndexToNode(from_idx), manager.IndexToNode(to_idx)
        return data["distance_matrix"][f][t]

    distance_cb_idx = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(distance_cb_idx)

    # Add capacity dimension using the official CVRP approach
    def demand_callback(from_idx):
        """Returns the demand of the node."""
        from_node = manager.IndexToNode(from_idx)
        return data["demands"][from_node]

    demand_cb_idx = routing.RegisterUnaryTransitCallback(demand_callback)
    
    # Use AddDimensionWithVehicleCapacity exactly like the official example
    routing.AddDimensionWithVehicleCapacity(
        demand_cb_idx,
        0,  # null capacity slack
        data["vehicle_capacities"],  # vehicle maximum capacities
        True,  # start cumul to zero
        "Capacity"
    )

    # Solver params
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_params.time_limit.seconds = 15

    print("🔧 Solving with capacity constraints using AddDimensionWithVehicleCapacity...", file=sys.stderr)
    solution = routing.SolveWithParameters(search_params)

    if not solution:
        print("❌ No feasible solution found", file=sys.stderr)
        return {"error": "No feasible solution found."}

    # Extract results
    routes = []
    total_distance = 0
    total_load = 0

    for v in range(data["num_vehicles"]):
        if not routing.IsVehicleUsed(solution, v):
            continue
            
        index = routing.Start(v)
        route = []
        loads = []

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            load = solution.Value(routing.GetDimensionOrDie("Capacity").CumulVar(index))
            route.append(node)
            loads.append(load)
            index = solution.Value(routing.NextVar(index))

        node = manager.IndexToNode(index)
        load = solution.Value(routing.GetDimensionOrDie("Capacity").CumulVar(index))
        route.append(node)
        loads.append(load)

        print(f"Vehicle {v} route: {route}", file=sys.stderr)
        print(f"Vehicle {v} loads: {loads}", file=sys.stderr)
        
        if len(route) > 2:  # At least depot -> depot
            route_distance = sum(
                data["distance_matrix"][route[i]][route[i + 1]]
                for i in range(len(route) - 1)
            )
            route_load = loads[-1]  # Final load (total load carried)

            routes.append({
                "vehicle_id": v,
                "route": route,
                "loads": loads,
                "distance": route_distance,
                "time": 0,  # No time calculation for now
                "load": route_load,
                "capacity": data["vehicle_capacities"][v]
            })

            total_distance += route_distance
            total_load += route_load

    if not routes:
        print("❌ No routes found after solving", file=sys.stderr)
        return {"error": "No routes found after solving"}

    print(f"✅ Found {len(routes)} routes", file=sys.stderr)
    print(f"📊 Total load: {total_load}", file=sys.stderr)
    return {
        "routes": routes,
        "total_distance": total_distance,
        "total_time": 0,  # No time calculation for now
        "total_load": total_load,
        "num_vehicles_used": len(routes)
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python vrptw_solver.py '<json_input>'")
        sys.exit(1)

    try:
        raw_input = json.loads(sys.argv[1])
        data = create_data_model(raw_input)
        result = solve_vrptw(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
