# ViaSync Delivery Backend

A comprehensive Node.js backend service for delivery management, route optimization, and trip sheet generation. This system integrates with Supabase for data storage, QuickFlora API for delivery data, Google Maps API for geocoding and distance calculations, and OR-Tools for advanced route optimization.

## 🚀 Features

### Core Functionality
- 📦 **Delivery Management**: Complete CRUD operations for delivery data
- 🗺️ **Route Optimization**: Advanced VRPTW (Vehicle Routing Problem with Time Windows) using OR-Tools
- 📋 **Trip Sheet Generation**: Automated trip sheet creation and management
- 🔐 **Authentication**: Session-based authentication with QuickFlora API integration
- 📊 **Real-time Tracking**: Driver location tracking and delivery progress monitoring
- 🏪 **Multi-location Support**: Company location management for multiple shop locations

### Technical Features
- ⚡ **Real-time Geocoding**: Google Maps API integration for address validation
- 📏 **Distance Matrix**: Real-time travel time and distance calculations
- 💾 **Local Caching**: SQLite3 caching for geocoding and route storage
- 🔄 **Data Synchronization**: Automatic sync between QuickFlora API and Supabase
- 📈 **Analytics Dashboard**: Comprehensive delivery statistics and reporting
- 🛡️ **Security**: Helmet.js security headers and CORS protection

## 🏗️ Architecture

### Project Structure
```
src/
├── config/
│   └── environment.ts          # Environment configuration
├── controllers/
│   ├── deliveryController.ts   # Delivery management endpoints
│   ├── routeController.ts      # Route tracking and management
│   └── tripSheetController.ts  # Trip sheet operations
├── middleware/
│   └── authMiddleware.ts       # Authentication middleware
├── routes/
│   ├── authRoutes.ts          # Authentication endpoints
│   ├── deliveryRoutes.ts      # Delivery API routes
│   ├── routeRoutes.ts         # Route management routes
│   └── tripSheetRoutes.ts     # Trip sheet routes
├── services/
│   ├── AuthService.ts         # QuickFlora authentication
│   ├── DeliveryService.ts     # Core delivery business logic
│   ├── DistanceMatrixService.ts # Google Maps distance calculations
│   ├── GeocodingService.ts    # Address geocoding
│   ├── GeocodingCacheService.ts # Geocoding cache management
│   ├── OrToolsService.ts      # Route optimization engine
│   ├── QuickFloraTokenManager.ts # Token management
│   ├── RouteStorageService.ts # Route storage and tracking
│   ├── SupabaseService.ts     # Database operations
│   ├── TripSheetService.ts    # Trip sheet generation
│   └── UberService.ts         # Uber integration (DISABLED)
├── types/                     # TypeScript type definitions
├── utils/                     # Utility functions
└── index.ts                   # Server entry point
```

## 📋 Prerequisites

- **Node.js 18+**
- **Supabase account** with configured database
- **QuickFlora API access** for delivery data
- **Google Maps API key** for geocoding and distance calculations
- **Python 3.8+** (for OR-Tools route optimization)

## 🛠️ Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd viasync-delivery-backend
```

2. **Install Node.js dependencies:**
```bash
npm install
```

3. **Install Python dependencies:**
```bash
cd python
pip install -r requirements.txt
cd ..
```

4. **Set up environment variables:**
```bash
cp env.example .env
```

5. **Configure your `.env` file:**
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Shop Configuration (fallback if no company_locations found)
SHOP_ADDRESS=456 Flower Shop, San Francisco, CA 94103
SHOP_NAME=Your Flower Shop

# Google Maps API (required for route optimization)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Timeouts (optional)
SUPABASE_TIMEOUT=10000
```

6. **Set up the database:**
   - Run the SQL schema from `database-schema.sql` in your Supabase SQL editor
   - This creates all necessary tables with proper indexes and relationships

## 🚀 Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Health Check
```bash
curl http://localhost:3000/health
```

## 📊 Database Schema

### Deliveries Table
```sql
CREATE TABLE deliveries (
    id SERIAL PRIMARY KEY,
    
    -- QuickFlora API Fields
    row_number INTEGER,
    tid VARCHAR(50),
    shipping_name VARCHAR(255),
    assigned_to VARCHAR(100),
    shipping_company VARCHAR(255),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    shipping_address1 TEXT,
    shipping_address2 TEXT,
    shipping_state VARCHAR(10),
    shipping_city VARCHAR(100),
    shipping_zip VARCHAR(20),
    priority VARCHAR(50),
    destination_type VARCHAR(10),
    assigned BOOLEAN DEFAULT false,
    order_ship_date DATE,
    order_status VARCHAR(50) DEFAULT 'Pending',
    
    -- ViaSync Fields
    trip_sheet_id VARCHAR(50),
    stop_order INTEGER,
    vehicle_id INTEGER,
    estimated_arrival_time VARCHAR(20),
    actual_arrival_time VARCHAR(20),
    delivery_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Trip Sheets Table
```sql
CREATE TABLE trip_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_sheet_id VARCHAR(50) UNIQUE NOT NULL,
    sheet_name VARCHAR(255),
    delivery_date DATE NOT NULL,
    depot_address TEXT NOT NULL,
    driver_name VARCHAR(100),
    vehicle_name VARCHAR(50),
    vehicle_capacity INTEGER,
    total_stops INTEGER DEFAULT 0,
    completed_stops INTEGER DEFAULT 0,
    total_miles REAL,
    time_range_start VARCHAR(20),
    time_range_end VARCHAR(20),
    status VARCHAR(50) DEFAULT 'active',
    optimization_result JSONB,
    company_id VARCHAR(100) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Company Locations Table
```sql
CREATE TABLE company_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id VARCHAR(100) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(10) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User authentication with QuickFlora
- `POST /api/auth/logout` - User logout
- `GET /api/auth/session` - Validate current session
- `POST /api/auth/refresh` - Refresh session token
- `GET /api/auth/stats` - Session statistics

### Delivery Management
- `GET /api/delivery/deliveries` - Get all deliveries with filters
- `GET /api/delivery/deliveries-by-date` - Get deliveries for specific date
- `GET /api/delivery/dashboard-stats` - Get delivery statistics
- `GET /api/delivery/:id` - Get single delivery by ID
- `PATCH /api/delivery/:id/status` - Update delivery status
- `PATCH /api/delivery/bulk-update-status` - Bulk update delivery statuses
- `GET /api/delivery/health` - Delivery service health check

### Route Optimization
- `POST /api/delivery/optimize` - Optimize delivery routes
- `POST /api/delivery/optimize-from-database` - Optimize routes from database data

### Route Management
- `GET /api/routes/driver/:routeId/:vehicleId` - Get route for driver
- `PUT /api/routes/driver/:routeId/:vehicleId/:locationId/progress` - Update delivery progress
- `PUT /api/routes/driver/:routeId/:vehicleId/location` - Update driver location
- `GET /api/routes/shop/:routeId` - Get route for shop owner
- `GET /api/routes/shop/active` - Get active routes
- `GET /api/routes/shop/date-range` - Get routes by date range
- `PUT /api/routes/shop/:routeId/status` - Update route status

### Trip Sheet Management
- `POST /api/trip-sheets/generate` - Generate trip sheet from optimized route
- `GET /api/trip-sheets/:tripSheetId` - Get trip sheet by ID
- `PUT /api/trip-sheets/:tripSheetId` - Update trip sheet
- `DELETE /api/trip-sheets/:tripSheetId` - Delete trip sheet
- `GET /api/trip-sheets/` - Get all active trip sheets
- `GET /api/trip-sheets/by-date-range` - Get trip sheets by date range

## 📝 Example API Usage

### Authentication
```bash
# Login
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeID": "your_employee_id",
    "companyID": "your_company_id", 
    "employeePassword": "your_password"
  }'
```

### Get Deliveries
```bash
# Get deliveries for today
curl -H "x-session-token: your_session_token" \
  "http://localhost:3000/api/delivery/deliveries?fromDate=2024-01-15&status=Booked"
```

### Optimize Routes
```bash
# Optimize delivery routes
curl -X POST "http://localhost:3000/api/delivery/optimize-from-database" \
  -H "Content-Type: application/json" \
  -H "x-session-token: your_session_token" \
  -d '{
    "fromDate": "2024-01-15",
    "toDate": "2024-01-15",
    "vehicleCapacities": [20, 20],
    "serviceTimeMinutes": 10
  }'
```

### Generate Trip Sheet
```bash
# Generate trip sheet
curl -X POST "http://localhost:3000/api/trip-sheets/generate" \
  -H "Content-Type: application/json" \
  -H "x-session-token: your_session_token" \
  -d '{
    "routeId": "route_123",
    "driverName": "John Doe",
    "vehicleName": "Van-01"
  }'
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment mode | No | development |
| `SUPABASE_URL` | Supabase project URL | Yes | - |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes | - |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key | Yes | - |
| `SHOP_ADDRESS` | Fallback shop address | No | "456 Flower Shop, San Francisco, CA 94103" |
| `SHOP_NAME` | Fallback shop name | No | "Your Flower Shop" |
| `SUPABASE_TIMEOUT` | Supabase request timeout | No | 10000 |

### Services Status

| Service | Status | Description |
|---------|--------|-------------|
| **Supabase** | ✅ Active | Database operations and data storage |
| **QuickFlora API** | ✅ Active | Authentication and delivery data sync |
| **Google Maps API** | ✅ Active | Geocoding and distance calculations |
| **OR-Tools** | ✅ Active | Route optimization engine |
| **Uber API** | ❌ Disabled | Delivery quotes (requires Uber Direct API access) |

## 🔍 How It Works

### 1. Authentication Flow
1. User logs in with QuickFlora credentials
2. System validates credentials and creates session
3. Session token is used for all subsequent API calls
4. Automatic token refresh maintains session validity

### 2. Delivery Data Flow
1. **Sync**: Fetch latest delivery data from QuickFlora API
2. **Store**: Save data to Supabase database
3. **Process**: Apply business logic and validation
4. **Optimize**: Use OR-Tools for route optimization
5. **Track**: Monitor delivery progress in real-time

### 3. Route Optimization Process
1. **Geocode**: Convert addresses to coordinates using Google Maps
2. **Calculate**: Get distance/time matrix with traffic data
3. **Optimize**: Use OR-Tools VRPTW solver for optimal routes
4. **Store**: Save optimized routes to local SQLite cache
5. **Generate**: Create trip sheets for drivers

### 4. Real-time Tracking
1. **Driver Updates**: Drivers report location and delivery status
2. **Progress Tracking**: System tracks completion status
3. **Analytics**: Generate real-time statistics and reports
4. **Notifications**: Alert system for delays or issues

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Code Quality
```bash
npm run lint
npm run format
```

### Database Migrations
- All database changes are in `database-schema.sql`
- Run the SQL file in Supabase SQL editor to apply changes
- The schema includes proper indexes and foreign key constraints

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify QuickFlora credentials are correct
   - Check if session token is valid and not expired
   - Ensure company ID and employee ID are correct

2. **Database Connection Issues**
   - Verify Supabase URL and keys are correct
   - Check if database tables exist and have proper permissions
   - Ensure RLS policies are configured correctly

3. **Route Optimization Failures**
   - Verify Google Maps API key is valid and has required permissions
   - Check if Python dependencies are installed correctly
   - Ensure OR-Tools solver is working properly

4. **Geocoding Issues**
   - Verify Google Maps API key has Geocoding API enabled
   - Check if addresses are in supported regions
   - Ensure API quota is not exceeded

### Logs and Debugging

- **Development Mode**: All debug logs are enabled
- **Production Mode**: Only error and warning logs are shown
- **Session Management**: Check `/api/auth/stats` for session information
- **Health Checks**: Use `/health` and `/api/delivery/health` endpoints

## 📈 Performance Considerations

- **Caching**: Geocoding results are cached in SQLite for 24 hours
- **Rate Limiting**: Google Maps API calls are optimized to minimize usage
- **Database Indexing**: Proper indexes on frequently queried columns
- **Connection Pooling**: Supabase client handles connection pooling automatically
- **Memory Management**: Large datasets are processed in chunks

## 🔒 Security Features

- **Authentication**: Session-based authentication with QuickFlora integration
- **Authorization**: Route-level access control
- **Data Validation**: Input validation and sanitization
- **Security Headers**: Helmet.js provides security headers
- **CORS Protection**: Configured for specific origins
- **Row Level Security**: Supabase RLS policies protect data access

## 📋 Roadmap

### Completed Features
- ✅ Authentication system with QuickFlora integration
- ✅ Delivery data synchronization
- ✅ Route optimization with OR-Tools
- ✅ Trip sheet generation
- ✅ Real-time tracking system
- ✅ Multi-location support
- ✅ Comprehensive API documentation

### Future Enhancements
- 🔄 Uber Direct API integration (requires API access)
- 📱 Mobile app for drivers
- 🔔 Push notifications for delivery updates
- 📊 Advanced analytics dashboard
- 🗺️ Interactive route visualization
- 📦 Package tracking integration

## 📄 License

This project is licensed under the MIT License.

## 🤝 Support

For support and questions:
- Check the troubleshooting section above
- Review the API documentation
- Open an issue in the repository
- Contact the development team

---

**Note**: This system is production-ready and has been thoroughly tested. The Uber integration is temporarily disabled pending API access approval.