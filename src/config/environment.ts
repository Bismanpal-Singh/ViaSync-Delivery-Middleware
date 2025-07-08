export const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  // Uber API credentials
  uber: {
    clientId: process.env.UBER_CLIENT_ID || '',
    clientSecret: process.env.UBER_CLIENT_SECRET || '',
    customerId: process.env.UBER_CUSTOMER_ID || '',
    baseUrl: process.env.UBER_BASE_URL || 'https://api.uber.com/v1',
  },
  
  // Shop configuration
  shop: {
    address: process.env.SHOP_ADDRESS || '456 Flower Shop, San Francisco, CA 94103',
    name: process.env.SHOP_NAME || 'Your Flower Shop',
  },
  
  // API timeouts
  timeouts: {
    supabase: parseInt(process.env.SUPABASE_TIMEOUT || '10000'),
    uber: parseInt(process.env.UBER_TIMEOUT || '10000'),
  },
};

// Validation function to check if required environment variables are set
export function validateEnvironment(): void {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'UBER_CLIENT_ID',
    'UBER_CLIENT_SECRET',
    'UBER_CUSTOMER_ID',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn('⚠️  Missing environment variables:', missingVars);
    console.warn('Please set these variables in your .env file');
  } else {
    console.log('✅ All required environment variables are set');
  }
} 