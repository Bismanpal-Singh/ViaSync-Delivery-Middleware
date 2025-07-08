import { Router } from 'express';
import * as DeliveryController from '../controllers/deliveryController';

const router = Router();

// Optimize delivery routes
router.post('/optimize', DeliveryController.optimizeDelivery);

// Optimize delivery routes from database
router.post('/optimize-from-database', DeliveryController.optimizeDeliveryFromDatabase);

// Get delivery quotes
router.get('/quotes', DeliveryController.getDeliveryQuotes);

// Health check
router.get('/health', DeliveryController.healthCheck);

// Get all deliveries
router.get('/deliveries', DeliveryController.getAllDeliveries);

// Get a single delivery by ID
router.get('/:id', DeliveryController.getDeliveryById);

// Update delivery status
router.patch('/:id/status', DeliveryController.updateDeliveryStatus);

export default router;
