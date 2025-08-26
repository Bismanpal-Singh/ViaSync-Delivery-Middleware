import { Request, Response } from 'express';
import { TripSheetService } from '../services/TripSheetService';
import { DeliveryService } from '../services/DeliveryService';

const tripSheetService = new TripSheetService();
const deliveryService = new DeliveryService();

/**
 * Generate trip sheet from optimized route
 */
export const generateTripSheet = async (req: Request, res: Response): Promise<void> => {
  const { sheetName, tripSheetName, deliveryDate, vehicleCapacities, startTime, driverName, vehicleName, serviceTimeMinutes, optimizationResult } = req.body;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    const tableAccessible = await tripSheetService.testTableAccess();
    if (!tableAccessible) {
      res.status(500).json({
        success: false,
        error: 'Trip sheets table is not accessible. Please check database setup.'
      });
      return;
    }

    if (!optimizationResult) {
      res.status(400).json({
        success: false,
        error: 'Optimization result is required. Please optimize the route first.'
      });
      return;
    }

    const tripSheet = await tripSheetService.generateTripSheet({
      sheetName: tripSheetName || sheetName, // Accept both field names
      deliveryDate,
      vehicleCapacities,
      startTime,
      driverName,
      vehicleName,
      serviceTimeMinutes: serviceTimeMinutes || 10, // Default to 10 minutes if not provided
      optimizationResult,
      companyId: userContext.companyId,
      createdBy: userContext.userId
    });

    res.json({
      success: true,
      data: tripSheet,
      message: `Trip sheet "${tripSheet.id}" generated successfully with ${tripSheet.totalStops} stops. Orders have been marked as "Routed".`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to generate trip sheet'
    });
  }
};

/**
 * Get trip sheet by ID
 */
export const getTripSheet = async (req: Request, res: Response): Promise<void> => {
  const { tripSheetId } = req.params;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    const tripSheet = await tripSheetService.getTripSheet(tripSheetId, userContext.companyId);
    
    if (!tripSheet) {
      res.status(404).json({
        success: false,
        error: 'Trip sheet not found'
      });
      return;
    }

    res.json({
      success: true,
      data: tripSheet,
      message: 'Trip sheet retrieved successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get trip sheet'
    });
  }
};

/**
 * Get all active trip sheets for a company
 * Now supports date filtering via query parameter
 */
export const getActiveTripSheets = async (req: Request, res: Response): Promise<void> => {
  const { date } = req.query;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    // Validate date format if provided
    if (date && typeof date === 'string') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD format (e.g., 2025-08-11)'
        });
        return;
      }
    }

    let tripSheets;
    
    if (date) {
      tripSheets = await tripSheetService.getTripSheetsByDate({
        companyId: userContext!.companyId,
        date: date as string
      });
    } else {
      tripSheets = await tripSheetService.getActiveTripSheets(userContext!.companyId);
    }

    res.json({
      success: true,
      data: {
        tripSheets: tripSheets
      },
      message: date 
        ? `Retrieved ${tripSheets.length} trip sheets for ${date}`
        : `Retrieved ${tripSheets.length} active trip sheets`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get trip sheets'
    });
  }
};

/**
 * Get trip sheets by date range
 */
export const getTripSheetsByDateRange = async (req: Request, res: Response): Promise<void> => {
  const { startDate, endDate, status } = req.query;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    const tripSheets = await tripSheetService.getTripSheetsByDateRange({
      companyId: userContext!.companyId,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string
    });

    res.json({
      success: true,
      data: tripSheets,
      message: `Retrieved ${tripSheets.length} trip sheets`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get trip sheets'
    });
  }
};

/**
 * Update trip sheet
 */
export const updateTripSheet = async (req: Request, res: Response): Promise<void> => {
  const { tripSheetId } = req.params;
  const { sheetName, driverName, vehicleName, startTime, notes, deliveryInstructions } = req.body;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    const updatedTripSheet = await tripSheetService.updateTripSheet(tripSheetId, {
      sheetName,
      driverName,
      vehicleName,
      startTime,
      notes,
      deliveryInstructions
    });

    res.json({
      success: true,
      data: updatedTripSheet,
      message: 'Trip sheet updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to update trip sheet'
    });
  }
};

/**
 * Delete trip sheet
 */
export const deleteTripSheet = async (req: Request, res: Response): Promise<void> => {
  const { tripSheetId } = req.params;
  const updateStatus = (req.query.updateStatus as string | undefined)?.toLowerCase() as 'booked' | 'delivered' | 'none' | undefined;
  const orderIdsParam = req.query.orderIds as string | undefined;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  // Parse orderIds from query parameter
  let orderIds: number[] = [];
  if (orderIdsParam) {
    try {
      orderIds = JSON.parse(orderIdsParam);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid orderIds format. Expected JSON array.',
        message: 'Invalid orderIds parameter'
      });
      return;
    }
  }

  try {
    // Load the trip sheet (scoped by company) to verify ownership
    const sheet = await tripSheetService.getTripSheet(tripSheetId, userContext.companyId);
    if (!sheet) {
      res.status(404).json({ success: false, error: 'Trip sheet not found' });
      return;
    }

    let statusResult: { updated: number; failed: number } | null = null;
    if (orderIds.length > 0 && updateStatus && updateStatus !== 'none') {
      const target = updateStatus === 'booked' ? 'Booked' : 'Delivered';
      statusResult = await tripSheetService['supabaseService'].updateOrderStatus(orderIds.map(String), target);
    }

    await tripSheetService.deleteTripSheet(tripSheetId);

    res.json({
      success: true,
      data: {
        deleted: true,
        updated: statusResult?.updated || 0,
        failed: statusResult?.failed || 0,
        updateStatus: updateStatus || 'none'
      },
      message: 'Trip sheet deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to delete trip sheet'
    });
  }
};
