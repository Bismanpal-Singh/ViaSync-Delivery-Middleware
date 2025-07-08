#!/usr/bin/env python3

import json
import sys
from ortools.constraint_solver import routing_enums_pb2, pywrapcp


def create_data_model(input_data):
    return {
        "distance_matrix": input_data["distance_matrix"],
        "time_matrix": input_data["time_matrix"],
        "time_windows": input_data["time_windows"],
        "num_vehicles": input_data["num_vehicles"],
        "depot": input_data["depot"]
    }


def solve_vrptw(data):
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

    # Time callback
    def time_callback(from_idx, to_idx):
        f, t = manager.IndexToNode(from_idx), manager.IndexToNode(to_idx)
        return data["time_matrix"][f][t]

    time_cb_idx = routing.RegisterTransitCallback(time_callback)

    routing.AddDimension(
        time_cb_idx,
        slack_max=30,         # waiting time
        capacity=480,         # max time per vehicle (in minutes)
        fix_start_cumul_to_zero=False,
        name="Time"
    )

    time_dim = routing.GetDimensionOrDie("Time")

        # Apply time window constraints
    for location_idx, (start, end) in enumerate(data["time_windows"]):
        index = manager.NodeToIndex(location_idx)
        time_dim.CumulVar(index).SetRange(start, end)

    # ✅ Apply depot time window to all vehicle start nodes
    depot_start, depot_end = data["time_windows"][data["depot"]]
    for vehicle_id in range(data["num_vehicles"]):
        index = routing.Start(vehicle_id)
        time_dim.CumulVar(index).SetRange(depot_start, depot_end)

    # Solver params
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_params.time_limit.seconds = 10

    solution = routing.SolveWithParameters(search_params)

    if not solution:
        return {"error": "No feasible solution found."}

    # Extract results
    routes = []
    total_distance = 0
    total_time = 0

    for v in range(data["num_vehicles"]):
        index = routing.Start(v)
        route = []
        arrival_times = []

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            time = solution.Value(time_dim.CumulVar(index))
            route.append(node)
            arrival_times.append(time)
            index = solution.Value(routing.NextVar(index))

        node = manager.IndexToNode(index)
        time = solution.Value(time_dim.CumulVar(index))
        route.append(node)
        arrival_times.append(time)

        if len(route) > 2:
            route_distance = sum(
                data["distance_matrix"][route[i]][route[i + 1]]
                for i in range(len(route) - 1)
            )
            route_time = arrival_times[-1] - arrival_times[0]

            routes.append({
                "vehicle_id": v,
                "route": route,
                "arrival_times": arrival_times,
                "distance": route_distance,
                "time": route_time
            })

            total_distance += route_distance
            total_time += route_time

    return {
        "routes": routes,
        "total_distance": total_distance,
        "total_time": total_time,
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
