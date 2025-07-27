# ViaSync Delivery Backend

A Node.js backend service that integrates with Supabase for delivery data and Uber API for delivery quotes. This system provides real-time delivery pricing for flower shop deliveries.

## Features

- 📦 **Delivery Management**: Fetch and manage deliveries from Supabase database
- 🚚 **Uber Integration**: Get real-time delivery quotes from Uber API
- 📊 **Dashboard Data**: Comprehensive delivery analytics and pricing
- 🔍 **Address Geocoding**: Automatic address validation and geocoding
- ⚡ **Real-time Quotes**: Instant delivery cost estimates
- 🏪 **Shop Location Management**: Dynamic pickup location from company_locations table

## Prerequisites

- Node.js 18+ 
- Supabase account with `deliveries` and `company_locations` tables
- Uber API credentials

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd viasync-delivery-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Uber API Configuration
UBER_CLIENT_ID=your_uber_client_id
UBER_CLIENT_SECRET=your_uber_client_secret
UBER_CUSTOMER_ID=your_uber_customer_id

# Shop Configuration (fallback if no company_locations found)
SHOP_ADDRESS=your_shop_address
SHOP_NAME=your_shop_name

# Timeouts (optional)
SUPABASE_TIMEOUT=10000
UBER_TIMEOUT=10000
```

## Database Schema

The system expects two tables in your Supabase database:

### Deliveries Table
```sql
CREATE TABLE public.deliveries (
  id serial NOT NULL,
  sl_no integer NULL,
  order_number character varying(20) NULL,
  trip_id character varying(20) NULL,
  trip_prn character varying(20) NULL,
  sorting_order integer NULL,
  pack_list text NULL,
  ship_list text NULL,
  delivery_date date NULL,
  customer_name text NOT NULL,
  address_1 text NOT NULL,
  city character varying(100) NOT NULL,
  zip character varying(20) NOT NULL,
  priority character varying(50) NULL,
  destination_type character varying(50) NULL,
  status character varying(50) NULL DEFAULT 'Booked'::character varying,
  map_link text NULL DEFAULT 'click for map'::text,
  verified boolean NULL DEFAULT false,
  delivery_notes text NULL,
  zone character varying(50) NULL DEFAULT 'DEFAULT'::character varying,
  location_id character varying(50) NULL DEFAULT 'DEFAULT'::character varying,
  assigned_to character varying(100) NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  route_optimization_id uuid NULL,
  priority_start_time time without time zone NULL,
  priority_end_time time without time zone NULL,
  has_time_deadline boolean NULL DEFAULT false,
  deadline_priority_level integer NULL DEFAULT 0,
  CONSTRAINT deliveries_pkey PRIMARY KEY (id)
);
```

### Company Locations Table
```sql
CREATE TABLE public.company_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL,
  country text NOT NULL DEFAULT 'United States'::text,
  longitude text NULL,
  latitude text NULL,
  time_zone text NULL,
  language text NULL DEFAULT 'English'::text,
  currency text NULL DEFAULT 'USD'::text,
  website_platform text NULL,
  website_url text NULL,
  doordash_id text NULL,
  uber_id text NULL,
  lyft_id text NULL,
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  logo_url text NULL,
  CONSTRAINT company_locations_pkey PRIMARY KEY (id)
);
```

**Important**: The system will use the most recent active company location as the pickup point for all deliveries.

## Usage

### Start the server:
```bash
npm start
```

### Development mode with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Health Check
- `GET /health` - Server health status
- `GET /api/delivery/health` - Delivery service health

### Shop Location Management
- `GET /api/delivery/company-locations` - Get all company locations
- `GET /api/delivery/shop-location` - Get current active shop location

### Delivery Quotes
- `GET /api/delivery/quotes` - Get delivery quotes with filters
  - Query params: `fromDate`, `toDate`, `status`, `limit`, `offset`
- `GET /api/delivery/quotes/:id` - Get quote for specific delivery
- `GET /api/delivery/recent` - Get recent deliveries with quotes
  - Query params: `limit` (default: 10)
- `GET /api/delivery/dashboard` - Get dashboard data

### Address Testing
- `POST /api/delivery/quotes/addresses` - Get quotes for specific addresses
  - Body: `{ "addresses": ["address1", "address2", ...] }`

## Example API Usage

### Get current shop location:
```bash
curl "http://localhost:3000/api/delivery/shop-location"
```

### Get all company locations:
```bash
curl "http://localhost:3000/api/delivery/company-locations"
```

### Get delivery quotes for today's deliveries:
```bash
curl "http://localhost:3000/api/delivery/quotes?fromDate=2024-01-15&status=Booked"
```

### Get quote for specific delivery:
```bash
curl "http://localhost:3000/api/delivery/quotes/123"
```

### Get recent deliveries with quotes:
```bash
curl "http://localhost:3000/api/delivery/recent?limit=5"
```

### Test addresses:
```bash
curl -X POST "http://localhost:3000/api/delivery/quotes/addresses" \
  -H "Content-Type: application/json" \
  -d '{"addresses": ["123 Main St, San Francisco, CA 94102"]}'
```

## Response Format

### Shop Location Response:
```json
{
  "success": true,
  "data": {
    "shopLocation": "Flower Shop, 123 Main St, San Francisco, CA 94103",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "message": "Shop location retrieved successfully"
}
```

### Delivery Quote Response:
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "deliveryId": 123,
        "orderNumber": "ORD-001",
        "customerName": "John Doe",
        "deliveryAddress": "123 Main St, San Francisco, CA 94102",
        "deliveryDate": "2024-01-15",
        "status": "Booked",
        "priority": "High",
        "uberQuote": {
          "provider": "Uber",
          "quoteId": "quote_123",
          "cost": {
            "amount": 15.50,
            "currency": "USD",
            "formatted": "$15.50"
          },
          "duration": {
            "seconds": 1800,
            "minutes": 30,
            "formatted": "30 min"
          },
          "distance": {
            "meters": 5000,
            "miles": "3.1",
            "formatted": "3.1 miles"
          }
        }
      }
    ],
    "summary": {
      "totalDeliveries": 10,
      "deliveriesWithQuotes": 8,
      "totalUberCost": 124.00,
      "averageUberCost": 15.50
    },
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "message": "Retrieved 10 delivery quotes"
}
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SUPABASE_URL` | Your Supabase project URL | Yes | - |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `UBER_CLIENT_ID` | Uber API client ID | Yes | - |
| `UBER_CLIENT_SECRET` | Uber API client secret | Yes | - |
| `UBER_CUSTOMER_ID` | Uber customer ID | Yes | - |
| `SHOP_ADDRESS` | Fallback shop address | No | "456 Flower Shop, San Francisco, CA 94103" |
| `SHOP_NAME` | Fallback shop name | No | "Your Flower Shop" |

## How It Works

1. **Shop Location**: The system fetches the active company location from `company_locations` table
2. **Delivery Data**: Queries the `deliveries` table for delivery records
3. **Address Formatting**: Combines `address_1`, `city`, `zip` for delivery addresses
4. **Uber Quotes**: Gets delivery quotes from Uber API using shop location as pickup point
5. **Caching**: Shop location is cached for 5 minutes to improve performance

## Development

### Project Structure
```
src/
├── config/
│   └── environment.ts      # Environment configuration
├── controllers/
│   └── DeliveryController.ts # API controllers
├── routes/
│   └── delivery.ts         # API routes
├── services/
│   ├── DeliveryService.ts  # Main business logic
│   ├── SupabaseService.ts  # Database operations
│   └── UberService.ts      # Uber API integration
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions
└── index.ts               # Server entry point
```

### Running Tests
```bash
npm test
```

### Code Quality
```bash
npm run lint
npm run format
```

## Troubleshooting

### Common Issues

1. **Supabase Connection Error**
   - Verify your Supabase URL and keys
   - Check if your database is accessible

2. **Uber API Errors**
   - Ensure your Uber credentials are correct
   - Check if your Uber account is active

3. **Address Geocoding Issues**
   - Verify address format is correct
   - Check if addresses are in supported regions

4. **Shop Location Not Found**
   - Ensure you have at least one active record in `company_locations` table
   - Check that `is_active` is set to `true`

### Logs

The application uses structured logging. Check the console output for detailed error messages and debugging information.

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository.
