# 🚀 Quick Setup Guide

## Step 1: Get Your Supabase Credentials

1. **Go to your Supabase project**: https://supabase.com/dashboard
2. **Select your project** (or create a new one)
3. **Navigate to Settings → API**
4. **Copy these values:**
   - **Project URL** (looks like: `https://your-project-id.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 2: Create Environment File

Create a `.env` file in the root directory:

```bash
# Copy the example file
cp env.example .env
```

Then edit `.env` with your actual values:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_actual_anon_key_here

# Uber API Configuration (optional for now)
UBER_CLIENT_ID=
UBER_CLIENT_SECRET=
UBER_CUSTOMER_ID=

# Shop Configuration (fallback)
SHOP_ADDRESS=456 Flower Shop, San Francisco, CA 94103
SHOP_NAME=Your Flower Shop
```

## Step 3: Test Supabase Connection

Run the connection test:

```bash
node setup-test.js
```

This will:
- ✅ Check your environment variables
- ✅ Test database connection
- ✅ Verify your tables exist
- ✅ Show sample data

## Step 4: Add Sample Data (if needed)

If you don't have data in your tables, you can add some:

### Add a Company Location:
```sql
INSERT INTO company_locations (
  location_name, 
  address, 
  city, 
  state, 
  zip_code, 
  is_active
) VALUES (
  'Your Flower Shop',
  '123 Main Street',
  'San Francisco',
  'CA',
  '94103',
  true
);
```

### Add Sample Deliveries:
```sql
INSERT INTO deliveries (
  customer_name,
  address_1,
  city,
  zip,
  delivery_date,
  status
) VALUES 
('John Doe', '456 Oak Street', 'San Francisco', '94102', '2024-01-15', 'Booked'),
('Jane Smith', '789 Pine Avenue', 'Oakland', '94601', '2024-01-16', 'Booked'),
('Bob Johnson', '321 Elm Road', 'San Jose', '95112', '2024-01-17', 'Pending');
```

## Step 5: Start the Server

```bash
npm start
```

## Step 6: Test the API

```bash
# Test basic connection
curl http://localhost:3000/health

# Test shop location
curl http://localhost:3000/api/delivery/shop-location

# Test deliveries
curl http://localhost:3000/api/delivery/recent?limit=3
```

## Step 7: Run Full Test Suite

```bash
node test-deliveries.js
```

## 🔧 Troubleshooting

### "Missing Supabase credentials"
- Check your `.env` file exists
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are set

### "Connection failed"
- Check your Supabase URL format
- Verify your anon key is correct
- Ensure your project is active

### "Table not found"
- Make sure you have the `deliveries` and `company_locations` tables
- Check table names match exactly

### "No data found"
- Add some sample data using the SQL commands above
- Check that `is_active = true` for company locations

## 📞 Need Help?

1. **Check the logs** - Look for error messages
2. **Verify credentials** - Double-check your Supabase URL and key
3. **Test connection** - Run `node setup-test.js` for detailed diagnostics
4. **Check tables** - Ensure your database has the required tables

## 🎯 Next Steps

Once Supabase is connected:
1. **Add Uber credentials** to get delivery quotes
2. **Test the full API** with `node test-deliveries.js`
3. **Build your frontend** to consume the API
4. **Deploy to production** when ready 