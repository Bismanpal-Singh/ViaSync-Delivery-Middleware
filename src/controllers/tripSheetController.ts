import { Request, Response } from 'express';
import { TripSheetService } from '../services/TripSheetService';
import { DeliveryService } from '../services/DeliveryService';

const tripSheetService = new TripSheetService();
const deliveryService = new DeliveryService();

/**
 * Generate trip sheet from optimized route
 */
export const generateTripSheet = async (req: Request, res: Response): Promise<void> => {
  const { sheetName, deliveryDate, vehicleCapacities, startTime, driverName, vehicleName, optimizationResult } = req.body;
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

      try {
      // Test table access first
      const tableAccessible = await tripSheetService.testTableAccess();
      if (!tableAccessible) {
        res.status(500).json({
          success: false,
          error: 'Trip sheets table is not accessible. Please check database setup.'
        });
        return;
      }

    // Use the provided optimization result instead of re-running optimization
    if (!optimizationResult) {
      res.status(400).json({
        success: false,
        error: 'Optimization result is required. Please optimize the route first.'
      });
      return;
    }

    // Then generate trip sheet
    const tripSheet = await tripSheetService.generateTripSheet({
      sheetName,
      deliveryDate,
      vehicleCapacities,
      startTime,
      driverName,
      vehicleName,
      optimizationResult,
      companyId: userContext.companyId,
      createdBy: userContext.userId
    });

    res.json({
      success: true,
      data: tripSheet,
      message: `Trip sheet "${tripSheet.id}" generated successfully with ${tripSheet.totalStops} stops`
    });

  } catch (error) {
    console.error('❌ Failed to generate trip sheet:', error);
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
    const tripSheet = await tripSheetService.getTripSheet(tripSheetId);
    
    if (!tripSheet) {
      res.status(404).json({
        success: false,
        error: 'Trip sheet not found'
      });
      return;
    }

    // Note: Company access verification removed since new schema doesn't have company_id
    // You may want to add this back based on your business logic

    res.json({
      success: true,
      data: tripSheet,
      message: 'Trip sheet retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Failed to get trip sheet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get trip sheet'
    });
  }
};

/**
 * Get all active trip sheets for a company
 */
export const getActiveTripSheets = async (req: Request, res: Response): Promise<void> => {
  const userContext = req.user;

  if (!userContext) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    const tripSheets = await tripSheetService.getActiveTripSheets(userContext!.companyId);

    res.json({
      success: true,
      data: tripSheets,
      message: `Retrieved ${tripSheets.length} active trip sheets`
    });

  } catch (error) {
    console.error('❌ Failed to get active trip sheets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get active trip sheets'
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
    console.error('❌ Failed to get trip sheets by date range:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to get trip sheets'
    });
  }
};
