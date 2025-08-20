// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import deliveryRoutes from './routes/deliveryRoutes';
import routeRoutes from './routes/routeRoutes';
import tripSheetRoutes from './routes/tripSheetRoutes';
import authRoutes, { setAuthService } from './routes/authRoutes';
import { setAuthService as setDeliveryControllerAuthService } from './controllers/deliveryController';
import { authenticateUser, optionalAuth } from './middleware/authMiddleware';
import { AuthService } from './services/AuthService';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize AuthService for middleware
const authService = new AuthService();

// Pass the same AuthService instance to auth routes and delivery controller
setAuthService(authService);
setDeliveryControllerAuthService(authService);

// CORS configuration for Vite frontend
const corsOptions = {
  origin: [
    'http://localhost:8080', // User's frontend port
    'http://localhost:5173', // Vite default port
    'http://localhost:3000', // React default port
    'http://localhost:3001', // Alternative React port
    'http://127.0.0.1:5173', // Vite alternative
    'http://127.0.0.1:3000', // React alternative
    'http://127.0.0.1:8080', // User's frontend alternative
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-session-token'],
};

// Middleware
app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // Enable CORS with specific options
app.use(morgan('combined')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Basic route
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
      shopRoutes: '/api/routes/shop',
      
      tripSheets: '/api/trip-sheets',
      generateTripSheet: '/api/trip-sheets/generate'
    },
    cors: {
      enabled: true,
      origins: ['http://localhost:8080', 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001']
    }
  });
});

// Health check endpoint
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

// Authentication routes (no auth required)
app.use('/api/auth', authRoutes);

// API routes with authentication
app.use('/api/delivery', authenticateUser(authService), deliveryRoutes);
app.use('/api/routes', authenticateUser(authService), routeRoutes);
app.use('/api/trip-sheets', authenticateUser(authService), tripSheetRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Authentication API: http://localhost:${PORT}/api/auth`);
  console.log(`🚚 Delivery API: http://localhost:${PORT}/api/delivery`);
  console.log(`🗺️ Route Storage API: http://localhost:${PORT}/api/routes`);
  console.log(`📋 API Documentation: http://localhost:${PORT}/`);
});

export default app; 