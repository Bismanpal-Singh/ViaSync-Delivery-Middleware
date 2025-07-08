-- Database Schema for ViaSync Delivery Dashboard
-- Run this in your Supabase SQL editor

-- Enable Row Level Security (RLS)
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    delivery_address TEXT NOT NULL,
    pickup_address TEXT NOT NULL,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create delivery_quotes table to cache Uber quotes
CREATE TABLE IF NOT EXISTS delivery_quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'uber',
    quote_id VARCHAR(100) UNIQUE NOT NULL,
    cost_amount DECIMAL(10,2) NOT NULL,
    cost_currency VARCHAR(3) DEFAULT 'USD',
    duration_seconds INTEGER NOT NULL,
    distance_meters INTEGER NOT NULL,
    pickup_eta_seconds INTEGER NOT NULL,
    dropoff_eta_seconds INTEGER NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_quotes_order_id ON delivery_quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_quotes_expires_at ON delivery_quotes(expires_at);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_quotes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your authentication needs)
-- For now, allowing all operations - you should restrict this based on your needs
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all operations on order_items" ON order_items FOR ALL USING (true);
CREATE POLICY "Allow all operations on delivery_quotes" ON delivery_quotes FOR ALL USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO orders (order_id, customer_name, customer_email, delivery_address, pickup_address, total_amount, status) VALUES
('ORDER001', 'John Smith', 'john@example.com', '123 Main St, San Francisco, CA 94102', '456 Flower Shop, San Francisco, CA 94103', 48.00, 'pending'),
('ORDER002', 'Sarah Johnson', 'sarah@example.com', '789 Oak Ave, San Francisco, CA 94105', '456 Flower Shop, San Francisco, CA 94103', 39.50, 'confirmed'),
('ORDER003', 'Mike Davis', 'mike@example.com', '321 Pine St, San Francisco, CA 94104', '456 Flower Shop, San Francisco, CA 94103', 33.50, 'pending')
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO order_items (order_id, product_name, quantity, unit_price, total_price) VALUES
('ORDER001', 'Red Roses', 12, 2.50, 30.00),
('ORDER001', 'White Lilies', 6, 3.00, 18.00),
('ORDER002', 'Mixed Bouquet', 1, 35.00, 35.00),
('ORDER002', 'Baby Breath', 3, 1.50, 4.50),
('ORDER003', 'Sunflowers', 8, 2.00, 16.00),
('ORDER003', 'Tulips', 10, 1.75, 17.50)
ON CONFLICT DO NOTHING;

-- Create view for orders with items
CREATE OR REPLACE VIEW orders_with_items AS
SELECT 
    o.*,
    json_agg(
        json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
        )
    ) as items
FROM orders o
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.id, o.order_id, o.customer_name, o.customer_email, o.customer_phone, 
         o.delivery_address, o.pickup_address, o.order_date, o.status, 
         o.total_amount, o.created_at, o.updated_at; 