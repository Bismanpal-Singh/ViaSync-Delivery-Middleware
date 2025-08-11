import { Router } from 'express';
import * as TripSheetController from '../controllers/tripSheetController';

const router = Router();

// Generate trip sheet from optimized route
router.post('/generate', TripSheetController.generateTripSheet);

// Get trip sheet by ID
router.get('/:tripSheetId', TripSheetController.getTripSheet);

// Get all active trip sheets
router.get('/', TripSheetController.getActiveTripSheets);

// Get trip sheets by date range
router.get('/by-date-range', TripSheetController.getTripSheetsByDateRange);

export default router;
