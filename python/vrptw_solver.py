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
    # Configuration
    SERVICE_TIME_SECONDS = 600  # 10 minutes service time at delivery locations
    SLACK_MAX_SECONDS = 30 * 60  # 30 minutes maximum slack
    MAX_TIME_SECONDS = 24 * 60 * 60  # 24 hours maximum
    SOLVER_TIME_LIMIT_SECONDS = 15  # 15 seconds solver time limit
    
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

    # Time callback (includes travel time + service time)
    def time_callback(from_idx, to_idx):
        f, t = manager.IndexToNode(from_idx), manager.IndexToNode(to_idx)
        travel_time = data["time_matrix"][f][t]
        
        # Add service time at delivery locations (not depot)
        if t != 0:  # If destination is not depot
            return travel_time + SERVICE_TIME_SECONDS
        else:
            return travel_time

    time_cb_idx = routing.RegisterTransitCallback(time_callback)

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

    # Add time dimension
    routing.AddDimension(
        time_cb_idx,
        SLACK_MAX_SECONDS,  # slack max
        MAX_TIME_SECONDS,  # maximum time
        False,  # start cumul to zero
        "Time"
    )

    time_dimension = routing.GetDimensionOrDie("Time")

    # Add time window constraints for each location
    for location_idx, time_window in enumerate(data["time_windows"]):
        index = manager.NodeToIndex(location_idx)
        time_dimension.CumulVar(index).SetRange(time_window[0], time_window[1])

    # Add time window constraints for vehicle start and end times
    for vehicle_id in range(data["num_vehicles"]):
        index = routing.Start(vehicle_id)
        time_dimension.CumulVar(index).SetRange(data["time_windows"][0][0], data["time_windows"][0][1])
        index = routing.End(vehicle_id)
        time_dimension.CumulVar(index).SetRange(data["time_windows"][0][0], data["time_windows"][0][1])

    # Solver params
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_params.time_limit.seconds = SOLVER_TIME_LIMIT_SECONDS

    solution = routing.SolveWithParameters(search_params)

    if not solution:
        return {"error": "No feasible solution found."}

    # Extract results
    routes = []
    total_distance = 0
    total_load = 0
    total_time = 0

    for v in range(data["num_vehicles"]):
        if not routing.IsVehicleUsed(solution, v):
            continue
            
        index = routing.Start(v)
        route = []
        loads = []
        arrival_times = []

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            load = solution.Value(routing.GetDimensionOrDie("Capacity").CumulVar(index))
            arrival_time = solution.Value(time_dimension.CumulVar(index))
            route.append(node)
            loads.append(load)
            arrival_times.append(arrival_time)
            index = solution.Value(routing.NextVar(index))

        node = manager.IndexToNode(index)
        load = solution.Value(routing.GetDimensionOrDie("Capacity").CumulVar(index))
        arrival_time = solution.Value(time_dimension.CumulVar(index))
        route.append(node)
        loads.append(load)
        arrival_times.append(arrival_time)
        
        if len(route) > 2:  # At least depot -> depot
            route_distance = sum(
                data["distance_matrix"][route[i]][route[i + 1]]
                for i in range(len(route) - 1)
            )
            
            # Calculate route time using time dimension (includes service time)
            start_time = solution.Value(time_dimension.CumulVar(routing.Start(v)))
            end_time = solution.Value(time_dimension.CumulVar(routing.End(v)))
            route_time = end_time - start_time
            
            route_load = loads[-1]  # Final load (total load carried)

            routes.append({
                "vehicle_id": v,
                "route": route,
                "loads": loads,
                "arrival_times": arrival_times,
                "distance": route_distance,
                "time": route_time,
                "load": route_load,
                "capacity": data["vehicle_capacities"][v]
            })

            total_distance += route_distance
            total_time += route_time
            total_load += route_load

    if not routes:
        return {"error": "No routes found after solving"}

    return {
        "routes": routes,
        "total_distance": total_distance,
        "total_time": total_time,
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
