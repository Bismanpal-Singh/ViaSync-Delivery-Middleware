"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateEnvironment = validateEnvironment;
exports.config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    supabase: {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    uber: {
        clientId: process.env.UBER_CLIENT_ID || '',
        clientSecret: process.env.UBER_CLIENT_SECRET || '',
        customerId: process.env.UBER_CUSTOMER_ID || '',
        baseUrl: process.env.UBER_BASE_URL || 'https://api.uber.com/v1',
    },
    shop: {
        address: process.env.SHOP_ADDRESS || '456 Flower Shop, San Francisco, CA 94103',
        name: process.env.SHOP_NAME || 'Your Flower Shop',
    },
    timeouts: {
        supabase: parseInt(process.env.SUPABASE_TIMEOUT || '10000'),
        uber: parseInt(process.env.UBER_TIMEOUT || '10000'),
    },
};
function validateEnvironment() {
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
    }
    else {
        console.log('✅ All required environment variables are set');
    }
}
//# sourceMappingURL=environment.js.map