# Google OR-Tools Route Optimization

This project implements **Vehicle Routing Problem with Time Windows (VRPTW)** using Google OR-Tools to optimize delivery routes for multiple vehicles.

## 🚀 Features

- **Multi-vehicle route optimization** with configurable vehicle count
- **Time window constraints** for delivery appointments
- **Real-time traffic consideration** via Google Maps Distance Matrix API
- **Geocoding** of addresses to coordinates
- **Supabase integration** for delivery data
- **Python OR-Tools solver** with Node.js wrapper

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Node.js API    │    │   Python        │
│   Dashboard     │───▶│   (Express)      │───▶│   OR-Tools      │
│                 │    │                  │    │   Solver        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Supabase DB    │
                       │   (Deliveries)   │
                       └──────────────────┘
```

## 📋 Prerequisites

1. **Google Maps API Key** with these APIs enabled:
   - Geocoding API
   - Distance Matrix API

2. **Python 3.7+** with OR-Tools installed:
   ```bash
   cd python
   pip install -r requirements.txt
   ```

3. **Supabase Database** with these tables:
   - `deliveries` - Delivery orders
   - `company_locations` - Shop locations

## 🔧 Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   
   Fill in your `.env` file:
   ```env
   # Supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Google Maps
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   
   # Shop
   SHOP_ADDRESS=456 Flower Shop, San Francisco, CA 94103
   ```

3. **Install Python dependencies:**
   ```bash
   cd python
   pip install -r requirements.txt
   ```

## 🚚 API Endpoints

### Route Optimization
```http
POST /api/delivery/optimize
```

**Request Body:**
```json
{
  "depotAddress": "456 Flower Shop, San Francisco, CA 94103",
  "deliveries": [
    {
      "id": "delivery-1",
      "address": "123 Main St, San Francisco, CA 94102",
      "timeWindow": {
        "start": "09:00",
        "end": "12:00"
      }
    }
  ],
  "numVehicles": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "vehicleId": 1,
        "stops": [
          {
            "locationId": "depot",
            "address": "456 Flower Shop, San Francisco, CA 94103",
            "eta": "08:00"
          },
          {
            "locationId": "delivery-1",
            "address": "123 Main St, San Francisco, CA 94102",
            "eta": "09:15"
          }
        ],
        "totalDistance": 2.5,
        "totalTime": 75
      }
    ],
    "totalDistance": 2.5,
    "totalTime": 75,
    "numVehiclesUsed": 1
  }
}
```

### Health Check
```http
GET /api/delivery/health
```

### Get Deliveries
```http
GET /api/delivery?status=Booked&limit=10
```

## 🔍 How It Works

### 1. Data Preparation
- **Geocode addresses** to coordinates using Google Maps API
- **Get distance/time matrix** with real-time traffic data
- **Convert time windows** to minutes from midnight

### 2. OR-Tools Solver
- **VRPTW formulation** with time window constraints
- **Multi-vehicle routing** with capacity constraints
- **Guided Local Search** metaheuristic for optimization

### 3. Result Processing
- **Convert solver output** to readable routes
- **Calculate ETAs** for each delivery stop
- **Format response** for frontend consumption

## 🧪 Testing

Run the test script to verify optimization:
```bash
node test-optimization.js
```

Expected output:
```
🚚 Testing Route Optimization with Google OR-Tools
============================================================
📍 Depot: 456 Flower Shop, San Francisco, CA 94103
📦 Deliveries:
   1. 123 Main St, San Francisco, CA 94102 (09:00-12:00)
   2. 789 Oak Ave, San Francisco, CA 94105 (13:00-16:00)
   3. 321 Pine St, San Francisco, CA 94104 (10:00-14:00)
🚗 Vehicles: 2

🏥 Testing health endpoint...
✅ Health check passed: { status: 'healthy', orTools: 'available' }

🔄 Calling route optimization API...
✅ Optimization completed successfully!

📊 OPTIMIZATION RESULTS:
============================================================
Total Routes: 2
Total Distance: 8.45 km
Total Time: 127 minutes
Vehicles Used: 2

🚗 Route 1 (Vehicle 1):
   Total Distance: 4.23 km
   Total Time: 63 minutes
   Stops: 3
   1. 🏪 DEPOT: 456 Flower Shop, San Francisco, CA 94103 (ETA: 08:00)
   2. 📦 123 Main St, San Francisco, CA 94102 (ETA: 08:45)
   3. 📦 321 Pine St, San Francisco, CA 94104 (ETA: 09:30)

🚗 Route 2 (Vehicle 2):
   Total Distance: 4.22 km
   Total Time: 64 minutes
   Stops: 2
   1. 🏪 DEPOT: 456 Flower Shop, San Francisco, CA 94103 (ETA: 08:00)
   2. 📦 789 Oak Ave, San Francisco, CA 94105 (ETA: 13:15)

🎯 Test completed successfully!
```

## 🔧 Configuration

### Solver Parameters
Edit `python/vrptw_solver.py` to adjust:
- **Time limit**: `search_parameters.time_limit.seconds = 30`
- **Vehicle capacity**: `routing.AddDimension(...)`
- **Search strategy**: `FirstSolutionStrategy.PATH_CHEAPEST_ARC`

### Time Windows
- **Depot**: Flexible (8 AM - 4 PM)
- **Deliveries**: Customer-specified time windows
- **Service time**: 5 minutes per delivery (configurable)

## 🚨 Troubleshooting

### Common Issues

1. **"GOOGLE_MAPS_API_KEY is not set"**
   - Add your Google Maps API key to `.env`
   - Enable Geocoding and Distance Matrix APIs

2. **"Python solver failed"**
   - Install OR-Tools: `pip install ortools`
   - Check Python path in `OrToolsService.ts`

3. **"No feasible solution found"**
   - Reduce number of vehicles
   - Relax time window constraints
   - Check address geocoding accuracy

4. **"Supabase connection error"**
   - Verify Supabase credentials in `.env`
   - Check database table structure

### Debug Mode
Enable debug logging in `python/vrptw_solver.py`:
```python
print(f"Debug: Solving VRPTW with {num_vehicles} vehicles, {num_locations} locations")
```

## 📈 Performance

- **Small instances** (< 20 deliveries): < 5 seconds
- **Medium instances** (20-50 deliveries): 5-30 seconds
- **Large instances** (> 50 deliveries): 30+ seconds

## 🔮 Future Enhancements

1. **Real-time traffic updates** during route execution
2. **Dynamic vehicle assignment** based on capacity
3. **Multi-depot optimization** for multiple shop locations
4. **Driver preferences** and constraints
5. **Fuel efficiency** optimization
6. **Weather-aware** routing

## 📚 Resources

- [Google OR-Tools Documentation](https://developers.google.com/optimization)
- [VRPTW Problem Definition](https://en.wikipedia.org/wiki/Vehicle_routing_problem)
- [Google Maps APIs](https://developers.google.com/maps)
- [Supabase Documentation](https://supabase.com/docs) 