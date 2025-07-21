"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const deliveryRoutes_1 = __importDefault(require("./routes/deliveryRoutes"));
const routeRoutes_1 = __importDefault(require("./routes/routeRoutes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const corsOptions = {
    origin: [
        'http://localhost:8080',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    res.json({
        message: 'ViaSync Delivery Backend API',
        version: '1.0.0',
        status: 'running',
        description: 'Delivery management system with Supabase integration',
        endpoints: {
            health: '/health',
            delivery: '/api/delivery',
            deliveryHealth: '/api/delivery/health',
            routes: '/api/routes',
            driverRoutes: '/api/routes/driver',
            shopRoutes: '/api/routes/shop'
        },
        cors: {
            enabled: true,
            origins: ['http://localhost:8080', 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001']
        }
    });
});
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            server: 'operational',
            database: process.env.SUPABASE_URL ? 'configured' : 'not configured',
            uber: process.env.UBER_CLIENT_ID ? 'configured' : 'not configured'
        }
    });
});
app.use('/api/delivery', deliveryRoutes_1.default);
app.use('/api/routes', routeRoutes_1.default);
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🚚 Delivery API: http://localhost:${PORT}/api/delivery`);
    console.log(`🗺️ Route Storage API: http://localhost:${PORT}/api/routes`);
    console.log(`📋 API Documentation: http://localhost:${PORT}/`);
});
exports.default = app;
//# sourceMappingURL=index.js.map