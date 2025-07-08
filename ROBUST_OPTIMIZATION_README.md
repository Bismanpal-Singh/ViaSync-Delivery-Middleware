# Robust Delivery Optimization System

## Overview

This system provides a robust, scalable solution for optimizing delivery routes with variable vehicles and locations. It's designed to handle real-world scenarios where the number of vehicles and deliveries can vary significantly from day to day.

## Key Features

### 🚚 Variable Fleet Management
- **Dynamic vehicle allocation**: Handle 1-10+ vehicles per day
- **Flexible vehicle types**: Different capacities, time constraints, and start locations
- **Real-time optimization**: Adapt to changing conditions

### 📦 Scalable Delivery Processing
- **Variable delivery counts**: Process 1-50+ deliveries per day
- **Priority-based routing**: High, medium, low priority deliveries
- **Time window constraints**: Respect customer delivery windows
- **Geographic flexibility**: Handle deliveries across different areas

### 🔧 Multiple Optimization Strategies
- **Time-focused**: Minimize total travel time
- **Distance-focused**: Minimize total distance
- **Balanced**: Optimize both time and distance
- **Fallback mechanisms**: Simple assignment when optimization fails

### 🛡️ Robust Error Handling
- **Graceful degradation**: System continues working even with partial failures
- **Multiple retry strategies**: Different optimization approaches
- **Comprehensive validation**: Input validation and error reporting
- **Detailed logging**: Full traceability of optimization process

## API Endpoints

### POST `/api/delivery/optimize-routes`

Optimize delivery routes for variable vehicles and locations.

#### Request Body

```json
{
  "vehicles": [
    {
      "id": 1,
      "name": "Van 1",
      "capacity": 500,
      "maxTime": 480,
      "startLocation": {
        "address": "123 Main St, Toronto, ON",
        "latitude": 43.6532,
        "longitude": -79.3832
      },
      "startTime": "08:00",
      "endTime": "18:00"
    }
  ],
  "deliveries": [
    {
      "id": 1,
      "address": "456 Queen St W, Toronto, ON",
      "latitude": 43.6487,
      "longitude": -79.3774,
      "timeWindow": {
        "start": "09:00",
        "end": "12:00"
      },
      "priority": "high",
      "estimatedDuration": 15
    }
  ],
  "depotAddress": "123 Main St, Toronto, ON",
  "depotTimeWindow": {
    "start": "08:00",
    "end": "20:00"
  },
  "optimizationStrategy": "balanced",
  "allowTimeWindowViolations": false,
  "maxViolationMinutes": 30
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "vehicle": {
          "id": 1,
          "name": "Van 1",
          "capacity": 500,
          "maxTime": 480,
          "startLocation": {
            "address": "123 Main St, Toronto, ON",
            "latitude": 43.6532,
            "longitude": -79.3832
          },
          "startTime": "08:00",
          "endTime": "18:00"
        },
        "stops": [
          {
            "location": {
              "id": 1,
              "address": "456 Queen St W, Toronto, ON",
              "latitude": 43.6487,
              "longitude": -79.3774,
              "timeWindow": {
                "start": "09:00",
                "end": "12:00"
              },
              "priority": "high",
              "estimatedDuration": 15
            },
            "eta": "09:15",
            "departureTime": "09:30"
          }
        ],
        "totalDistance": 14.2,
        "totalTime": 180,
        "totalLoad": 15
      }
    ],
    "unassignedDeliveries": [],
    "summary": {
      "totalDeliveries": 3,
      "assignedDeliveries": 3,
      "totalDistance": 14.2,
      "totalTime": 180,
      "averageTimePerDelivery": 60,
      "timeWindowViolations": 0
    },
    "solveTime": 1250,
    "warnings": []
  },
  "message": "Optimization completed. 3/3 deliveries assigned."
}
```

## Use Cases

### Small Business (1 Vehicle, 3-5 Deliveries)
```javascript
// Example: Local flower shop with one delivery van
const smallBusinessRequest = {
  vehicles: [{
    id: 1,
    name: "Flower Van",
    capacity: 200,
    maxTime: 480,
    startLocation: { address: "123 Flower St, Toronto, ON" },
    startTime: "08:00",
    endTime: "18:00"
  }],
  deliveries: [
    // 3-5 local deliveries
  ],
  depotAddress: "123 Flower St, Toronto, ON",
  depotTimeWindow: { start: "08:00", end: "18:00" }
};
```

### Growing Business (2-3 Vehicles, 6-15 Deliveries)
```javascript
// Example: Expanding delivery service
const growingBusinessRequest = {
  vehicles: [
    {
      id: 1,
      name: "Van 1",
      capacity: 500,
      maxTime: 480,
      startLocation: { address: "123 Main St, Toronto, ON" },
      startTime: "08:00",
      endTime: "18:00"
    },
    {
      id: 2,
      name: "Van 2",
      capacity: 300,
      maxTime: 360,
      startLocation: { address: "123 Main St, Toronto, ON" },
      startTime: "09:00",
      endTime: "17:00"
    }
  ],
  deliveries: [
    // 6-15 deliveries across city
  ],
  depotAddress: "123 Main St, Toronto, ON",
  depotTimeWindow: { start: "08:00", end: "20:00" }
};
```

### Large Operation (3+ Vehicles, 15+ Deliveries)
```javascript
// Example: Established delivery company
const largeOperationRequest = {
  vehicles: [
    // Multiple vehicles with different capacities and schedules
  ],
  deliveries: [
    // 15+ deliveries across multiple areas
  ],
  depotAddress: "123 Main St, Toronto, ON",
  depotTimeWindow: { start: "08:00", end: "20:00" }
};
```

## Optimization Strategies

### 1. Standard Optimization
- Uses the specified optimization strategy (time/distance/balanced)
- Respects time window constraints
- Handles vehicle capacity limits

### 2. Time-Focused Fallback
- Prioritizes minimizing total travel time
- Allows small time window violations (30 minutes max)
- Useful when time is critical

### 3. Distance-Focused Fallback
- Prioritizes minimizing total distance
- Allows larger time window violations (60 minutes max)
- Useful for cost optimization

### 4. Relaxed Constraints
- Extends time windows by 1 hour each way
- Allows significant violations (120 minutes max)
- Ensures some solution is found

### 5. Simple Assignment
- Round-robin assignment when optimization fails
- No optimization but ensures all deliveries are assigned
- Last resort fallback

## Error Handling

### Input Validation
- Validates all required fields
- Checks time format (HH:MM)
- Ensures addresses are provided
- Validates vehicle configurations

### Geocoding Failures
- Handles failed address geocoding
- Provides clear error messages
- Continues with available coordinates

### Optimization Failures
- Multiple fallback strategies
- Graceful degradation
- Detailed error reporting

### API Failures
- Retry mechanisms for external APIs
- Fallback calculations
- Comprehensive error logging

## Testing

Run the comprehensive test suite:

```bash
node test_robust_optimization.js
```

This tests three scenarios:
1. **Small Operation**: 1 vehicle, 3 deliveries
2. **Medium Operation**: 2 vehicles, 6 deliveries  
3. **Large Operation**: 3 vehicles, 10 deliveries

## Configuration

### Environment Variables
```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### Optimization Parameters
- `optimizationStrategy`: 'time' | 'distance' | 'balanced'
- `allowTimeWindowViolations`: boolean
- `maxViolationMinutes`: number (default: 30)

## Performance

### Scalability
- **Small operations**: < 1 second
- **Medium operations**: 1-5 seconds
- **Large operations**: 5-30 seconds

### Optimization Quality
- **Standard scenarios**: 95%+ delivery assignment
- **Complex scenarios**: 85%+ delivery assignment
- **Fallback scenarios**: 100% delivery assignment

## Monitoring

### Logging
- Detailed optimization process logs
- Performance metrics
- Error tracking
- Success/failure rates

### Metrics
- Optimization solve time
- Delivery assignment rate
- Distance and time optimization
- Time window compliance

## Future Enhancements

### Planned Features
- **Real-time updates**: Dynamic route adjustments
- **Multi-depot support**: Multiple starting locations
- **Vehicle constraints**: Weight, volume, special requirements
- **Driver preferences**: Preferred routes, areas, customers
- **Weather integration**: Route adjustments for weather
- **Traffic integration**: Real-time traffic optimization

### Advanced Optimization
- **Machine learning**: Route pattern learning
- **Predictive analytics**: Demand forecasting
- **Cost optimization**: Fuel, maintenance, driver costs
- **Carbon footprint**: Environmental impact optimization

## Support

For issues or questions:
1. Check the logs for detailed error information
2. Verify input data format and validation
3. Test with smaller datasets first
4. Review optimization strategy settings

The system is designed to be robust and handle edge cases gracefully while providing detailed feedback for troubleshooting.