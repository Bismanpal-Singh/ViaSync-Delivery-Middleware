import { Router } from 'express';
import {
  getRouteForDriver,
  getRouteForShopOwner,
  updateDeliveryProgress,
  updateDriverLocation,
  getActiveRoutes,
  getRoutesByDateRange,
  updateRouteStatus
} from '../controllers/routeController';

const router = Router();

// Driver-specific endpoints
router.get('/driver/:routeId/:vehicleId', getRouteForDriver);
router.put('/driver/:routeId/:vehicleId/:locationId/progress', updateDeliveryProgress);
router.put('/driver/:routeId/:vehicleId/location', updateDriverLocation);

// Shop owner dashboard endpoints
router.get('/shop/:routeId', getRouteForShopOwner);
router.get('/shop/active', getActiveRoutes);
router.get('/shop/date-range', getRoutesByDateRange);
router.put('/shop/:routeId/status', updateRouteStatus);

export default router; 