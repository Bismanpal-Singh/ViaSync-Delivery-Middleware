import { Router } from 'express';
import * as TripSheetController from '../controllers/tripSheetController';

const router = Router();

// Generate trip sheet from optimized route
router.post('/generate', TripSheetController.generateTripSheet);

// Get trip sheet by ID
router.get('/:tripSheetId', TripSheetController.getTripSheet);

// Update trip sheet
router.put('/:tripSheetId', TripSheetController.updateTripSheet);

// Delete trip sheet
router.delete('/:tripSheetId', TripSheetController.deleteTripSheet);

// Get all active trip sheets
router.get('/', TripSheetController.getActiveTripSheets);

// Get trip sheets by date range
router.get('/by-date-range', TripSheetController.getTripSheetsByDateRange);

export default router;
