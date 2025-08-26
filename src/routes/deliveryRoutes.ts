import { Router } from 'express';
import * as DeliveryController from '../controllers/deliveryController';

const router = Router();

// Optimize delivery routes
router.post('/optimize', DeliveryController.optimizeDelivery);

// Optimize delivery routes from database
router.post('/optimize-from-database', DeliveryController.optimizeDeliveryFromDatabase);





// Health check
router.get('/health', DeliveryController.healthCheck);

// Get all deliveries (date ranges, raw array format)
router.get('/deliveries', DeliveryController.getAllDeliveries);

// Get deliveries for a specific date (enhanced format with stats)
router.get('/deliveries-by-date', DeliveryController.getAllDeliveries);

// Backward compatibility - deprecated, use /deliveries-by-date instead
router.get('/pending', DeliveryController.getAllDeliveries);

// Get dashboard statistics
router.get('/dashboard-stats', DeliveryController.getDashboardStats);



// Get a single delivery by ID
router.get('/:id', DeliveryController.getDeliveryById);

// Update delivery status
router.patch('/:id/status', DeliveryController.updateDeliveryStatus);

// Bulk update delivery statuses
router.patch('/bulk-update-status', DeliveryController.bulkUpdateDeliveryStatus);

export default router;
