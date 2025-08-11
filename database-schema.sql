-- Database Schema for ViaSync Delivery Dashboard
-- Run this in your Supabase SQL editor

-- Create comprehensive deliveries table for QuickFlora API data
CREATE TABLE IF NOT EXISTS deliveries (
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
    priority VARCHAR(50), -- Time window like "08:00-17:00"
    destination_type VARCHAR(10),
    assigned BOOLEAN DEFAULT false,
    order_ship_date DATE,
    order_status VARCHAR(50) DEFAULT 'Pending',
    
    -- ViaSync Fields (NEW - for trip sheet linking)
    trip_sheet_id VARCHAR(50), -- Links to trip_sheets.trip_sheet_id
    stop_order INTEGER, -- Order in the route
    vehicle_id INTEGER, -- Which vehicle is assigned
    estimated_arrival_time VARCHAR(20), -- "08:30 AM"
    actual_arrival_time VARCHAR(20),
    delivery_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trip Sheets table (main container)
CREATE TABLE IF NOT EXISTS trip_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_sheet_id VARCHAR(50) UNIQUE NOT NULL, -- "10-6-605132" format
    sheet_name VARCHAR(255),
    delivery_date DATE NOT NULL,
    depot_address TEXT NOT NULL,
    driver_name VARCHAR(100),
    vehicle_name VARCHAR(50), -- "Van-03", "Truck-02"
    vehicle_capacity INTEGER,
    total_stops INTEGER DEFAULT 0,
    completed_stops INTEGER DEFAULT 0,
    total_miles REAL,
    time_range_start VARCHAR(20), -- "8:00 AM"
    time_range_end VARCHAR(20), -- "3:00 PM"
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'in_progress', 'completed', 'cancelled'
    optimization_result JSONB, -- Store the complete route optimization result
    company_id VARCHAR(100) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trip Sheet Orders (links deliveries to trip sheets)
CREATE TABLE IF NOT EXISTS trip_sheet_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_sheet_id VARCHAR(50) NOT NULL,
    delivery_id INTEGER NOT NULL,
    stop_order INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    estimated_arrival_time VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_deliveries_trip_sheet_id ON deliveries(trip_sheet_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_ship_date ON deliveries(order_ship_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_status ON deliveries(order_status);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_company_id ON trip_sheets(company_id);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_delivery_date ON trip_sheets(delivery_date);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_status ON trip_sheets(status);
CREATE INDEX IF NOT EXISTS idx_trip_sheet_orders_trip_sheet_id ON trip_sheet_orders(trip_sheet_id);
CREATE INDEX IF NOT EXISTS idx_trip_sheet_orders_delivery_id ON trip_sheet_orders(delivery_id);

-- Add foreign key constraints after tables are created
ALTER TABLE deliveries 
ADD CONSTRAINT fk_deliveries_trip_sheet 
FOREIGN KEY (trip_sheet_id) REFERENCES trip_sheets(trip_sheet_id) ON DELETE SET NULL;

ALTER TABLE trip_sheet_orders 
ADD CONSTRAINT fk_trip_sheet_orders_trip_sheet 
FOREIGN KEY (trip_sheet_id) REFERENCES trip_sheets(trip_sheet_id) ON DELETE CASCADE;

ALTER TABLE trip_sheet_orders 
ADD CONSTRAINT fk_trip_sheet_orders_delivery 
FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;

-- Enable Row Level Security
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_sheet_orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic example - adjust based on your auth needs)
CREATE POLICY "Enable read access for all users" ON deliveries FOR SELECT USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON deliveries FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON deliveries FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON trip_sheets FOR SELECT USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON trip_sheets FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON trip_sheets FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON trip_sheet_orders FOR SELECT USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON trip_sheet_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON trip_sheet_orders FOR UPDATE USING (true); 