import { Request, Response } from 'express';
import { DeliveryService } from '../services/DeliveryService';
import { SupabaseService } from '../services/SupabaseService';
import { config } from '../config/environment';
import { GeocodingService } from '../services/GeocodingService';
import { AuthService } from '../services/AuthService';

// Initialize services
let authService: AuthService;
let deliveryService: DeliveryService;
let supabaseService: SupabaseService;
let geocodingService: GeocodingService;

// Function to set the AuthService instance from index.ts
export function setAuthService(authServiceInstance: AuthService) {
  authService = authServiceInstance;
  deliveryService = new DeliveryService(authService);
}

try {
  // Initialize services that don't depend on AuthService
  supabaseService = new SupabaseService({
    url: config.supabase.url,
    key: config.supabase.serviceKey || config.supabase.anonKey
  });
  geocodingService = new GeocodingService();
  console.log('All services initialized successfully');
} catch (error) {
    console.error('Failed to initialize services:', error);
  throw error; // This will prevent the server from starting with missing config
}

export const optimizeDelivery = async (req: Request, res: Response): Promise<void> => {
  const { depotAddress, deliveries, vehicleCapacities } = req.body;

  if (!depotAddress || !deliveries || !vehicleCapacities) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: depotAddress, deliveries, or vehicleCapacities'
    });
    return;
  }

  if (deliveries.length === 0 || !Array.isArray(vehicleCapacities) || vehicleCapacities.length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one delivery and a non-empty vehicleCapacities array are required'
    });
    return;
  }

  try {
    console.log(`Optimizing ${deliveries.length} deliveries with ${vehicleCapacities.length} vehicles`);

    const result = await deliveryService.optimizeDeliveryRoutes({
      depotAddress,
      deliveries,
      vehicleCapacities
    });

    res.json({
      success: true,
      data: result,
      message: `Successfully generated ${result.routes.length} routes`
    });

  } catch (error) {
    console.error('Route optimization failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to optimize delivery routes'
    });
  }
};

/**
 * Optimize delivery routes from database using the same filtering logic as GET /api/delivery/pending
 * This ensures that the optimization uses the exact same deliveries that the user sees on the frontend
 */
export const optimizeDeliveryFromDatabase = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, status, vehicleCapacities, depotAddress, limit, offset, startDate, startTime, date, serviceTimeMinutes } = req.body;

  // Validate vehicleCapacities array
  if (!vehicleCapacities || !Array.isArray(vehicleCapacities) || vehicleCapacities.length === 0) {
    res.status(400).json({
      success: false,
      error: 'vehicleCapacities array is required and must not be empty'
    });
    return;
  }

  // Validate each capacity is positive
  if (vehicleCapacities.some(capacity => !Number.isInteger(capacity) || capacity <= 0)) {
    res.status(400).json({
      success: false,
      error: 'All vehicle capacities must be positive integers'
    });
    return;
  }

  // numVehicles is derived from vehicleCapacities.length

  // Validate startTime format if provided
  if (startTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
    res.status(400).json({
      success: false,
      error: 'startTime must be in HH:MM format (e.g., "08:30")'
    });
    return;
  }

  // Validate startDate format if provided
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    res.status(400).json({
      success: false,
      error: 'startDate must be in YYYY-MM-DD format (e.g., "2024-01-15")'
    });
    return;
  }

  // Handle date parameter (for consistency with GET /api/delivery/pending)
  let finalFromDate = fromDate;
  let finalToDate = toDate;
  
  if (date && typeof date === 'string') {
    // If date is provided, use it for both fromDate and toDate (same day)
    finalFromDate = date;
    finalToDate = date;
    console.log(`📅 Using single date parameter: ${date}`);
  }

  try {
    console.log(`Optimizing routes from database with ${vehicleCapacities.length} vehicles`);
    console.log(`Vehicle capacities: [${vehicleCapacities.join(', ')}]`);
    console.log(`Date range: ${finalFromDate} to ${finalToDate}`);
    console.log(`Using same filtering as GET /api/delivery/pending (status: Booked,Pending)`);
    if (startDate || startTime) {
      console.log(`Using custom start time: ${startDate || 'today'} at ${startTime || 'now'}`);
    }

    // Get user context from request (set by auth middleware)
    const userContext = req.user;
    if (userContext) {
      console.log(`👤 User context: ${userContext.userId} (${userContext.companyId})`);
    } else {
      console.log('⚠️ No user context - using fallback authentication');
    }

    const result = await deliveryService.optimizeDeliveryRoutesFromDatabase({
      fromDate: finalFromDate,
      toDate: finalToDate,
      status,
      vehicleCapacities,
      depotAddress,
      limit,
      offset,
      startDate,
      startTime,
      serviceTimeMinutes: serviceTimeMinutes || 10, // Default to 10 minutes if not provided
      userContext
    });

    res.json({
      success: true,
      data: result,
      message: `Successfully optimized ${result.routes.length} routes for ${result.numVehiclesUsed} vehicles`
    });

  } catch (error) {
    console.error('❌ Database route optimization failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to optimize delivery routes from database'
    });
  }
};



export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('🏥 Health check endpoint hit');

    let supabaseStatus = 'unknown';
    try {
      await supabaseService.getRecentDeliveries(1);
      supabaseStatus = 'connected';
    } catch {
      supabaseStatus = 'error';
    }

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Delivery Service',
        supabase: supabaseStatus,
        orTools: 'available',
        uberIntegration: 'disabled'
      },
      message: 'Delivery service is healthy'
    });

  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Service unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getAllDeliveries = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, status, date } = req.query;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  // Get user context from request (set by auth middleware)
  const userContext = req.user;

  try {
    let deliveries;
    
    // If a specific date is provided, use the enhanced function with stats
    if (date && typeof date === 'string') {
      // Require authentication for this endpoint
      if (!userContext) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }
      
      try {
        // Get deliveries with sync using authenticated user context
        // For the pending endpoint, get all statuses (not just Booked)
        deliveries = await deliveryService.getPendingDeliveriesForDate(date, limit, userContext, undefined);
      } catch (error) {
        console.error('Failed to get deliveries:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch deliveries'
        });
        return;
      }
      
      // Calculate dashboard statistics
      const stats = calculateDashboardStats(deliveries);
      
      // Return enhanced response with stats
      res.json({
        success: true,
        data: {
          deliveries: deliveries,
          stats: stats,
          date: date,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      // Use the original logic for date ranges
      deliveries = await supabaseService.getDeliveries({
        fromDate: fromDate as string,
        toDate: toDate as string,
        status: status as string,
        limit,
        offset,
        companyId: userContext?.companyId
      });

      // Return a raw array as expected by the frontend (backward compatibility)
      res.json(deliveries);
    }

  } catch (error) {
    console.error('Failed to get deliveries:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : 'No stack trace' : undefined
    });
  }
};

export const getDeliveryById = async (req: Request, res: Response): Promise<void> => {
  const deliveryId = parseInt(req.params.id);

  if (isNaN(deliveryId)) {
    res.status(400).json({ success: false, error: 'Invalid delivery ID' });
    return;
  }

  try {
    const delivery = await supabaseService.getDeliveryById(deliveryId);

    if (!delivery) {
      res.status(404).json({ success: false, error: 'Delivery not found' });
      return;
    }

    res.json({
      success: true,
      data: delivery,
      message: 'Delivery retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Failed to get delivery by ID:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export const updateDeliveryStatus = async (req: Request, res: Response): Promise<void> => {
  const deliveryId = parseInt(req.params.id);
  const { status } = req.body;

  if (isNaN(deliveryId)) {
    res.status(400).json({ success: false, error: 'Invalid delivery ID' });
    return;
  }

  if (!status) {
    res.status(400).json({ success: false, error: 'Status is required' });
    return;
  }

  try {
    await supabaseService.updateDeliveryStatus(deliveryId, status);

    res.json({
      success: true,
      message: `Delivery ${deliveryId} status updated to ${status}`
    });

  } catch (error) {
    console.error('❌ Failed to update delivery status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export const getPendingDeliveriesWithCoords = async (req: Request, res: Response): Promise<void> => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid date parameter' });
    return;
  }
  try {
    // Fetch all pending deliveries for the date
    const deliveries = await supabaseService.getDeliveries({
      fromDate: date,
      toDate: date,
      status: 'pending',
      limit: 500
    });
    // For each delivery, get lat/lon using geocoding cache
    const results = await Promise.all(deliveries.map(async (delivery) => {
      const address = supabaseService.formatDeliveryAddress(delivery);
      const geo = await geocodingService.geocodeAddress(address);
      if (geo && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
        return {
          id: delivery.id,
          address,
          lat: geo.lat,
          lon: geo.lon
        };
      }
      return null;
    }));
    // Filter out any that failed geocoding
    const valid = results.filter((d): d is {id: any, address: string, lat: number, lon: number} => !!d);
    res.json(valid);
  } catch (error) {
    console.error('❌ Failed to get pending deliveries with coords:', error);
    res.status(500).json({ success: false, error: 'Failed to get pending deliveries with coordinates' });
  }
};

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  const { date } = req.query;
  const userContext = req.user;

  try {
    // Require authentication
    if (!userContext) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Use current date if none provided
    const targetDate = date as string || new Date().toISOString().split('T')[0];
    
    // Step 1: Get deliveries from QuickFlora API
    const allDeliveries = await deliveryService.syncDeliveriesFromQuickFlora({
      fromDate: targetDate,
      toDate: targetDate,
      status: undefined, // Get ALL statuses
      userContext: userContext,
      returnData: true // Return data directly
    });

    // Step 2: Sync the fetched data to Supabase with company ID
    let syncResult = null;
    if (Array.isArray(allDeliveries) && allDeliveries.length > 0) {
      syncResult = await supabaseService.syncWithQuickFlora(allDeliveries, userContext.companyId);
    }

    // Handle the return type (can be void or any[])
    const deliveries = Array.isArray(allDeliveries) ? allDeliveries : [];

    // Simple stats - just total count for now
    const stats = {
      total: deliveries.length
    };
    
    res.json({
      success: true,
      data: {
        stats: stats,
        date: targetDate,
        timestamp: new Date().toISOString(),
        synced: syncResult !== null,
        companyId: userContext.companyId,
        syncDetails: syncResult ? {
          added: syncResult.added,
          updated: syncResult.updated,
          failed: syncResult.failed
        } : null
      }
    });

  } catch (error) {
    console.error('Failed to get dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard stats'
    });
  }
};

// REMOVED: getPendingDeliveriesByDate - functionality merged into getAllDeliveries

/**
 * Calculate dashboard statistics from delivery data
 */
function calculateDashboardStats(deliveries: any[]) {
  const stats = {
    // Main Stats Cards
    total: deliveries.length,
    delivered: 0,
    inProgress: 0, // Shipped + In Transit
    activeDrivers: 0,
    
    // Performance Overview
    completionRate: 0,
    remaining: 0,
    urgentDeliveries: 0,
    
    // Status Breakdown
    booked: 0,
    shipped: 0,
    inTransit: 0,
    
    // Driver tracking
    uniqueDrivers: new Set<string>()
  };

  deliveries.forEach(delivery => {
    const status = delivery.status || delivery.order_status || 'Unknown';
    const priority = delivery.priority || '';
    const assignedTo = delivery.assigned_to;

    // Count by status
    switch (status.toLowerCase()) {
      case 'delivered':
        stats.delivered++;
        break;
      case 'shipped':
        stats.shipped++;
        stats.inProgress++;
        break;
      case 'in transit':
        stats.inTransit++;
        stats.inProgress++;
        break;
      case 'booked':
        stats.booked++;
        break;
    }

    // Count high priority deliveries
    if (priority && (priority.includes('11AM') || priority === 'AM Delivery')) {
      stats.urgentDeliveries++;
    }

    // Track unique drivers
    if (assignedTo && assignedTo.trim()) {
      stats.uniqueDrivers.add(assignedTo.trim());
    }
  });

  // Calculate derived stats
  stats.remaining = stats.total - stats.delivered;
  stats.completionRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  stats.activeDrivers = stats.uniqueDrivers.size;

  return {
    // Main Stats Cards
    total: stats.total,
    delivered: stats.delivered,
    inProgress: stats.inProgress,
    activeDrivers: stats.activeDrivers,
    
    // Performance Overview
    completionRate: stats.completionRate,
    remaining: stats.remaining,
    urgentDeliveries: stats.urgentDeliveries,
    
    // Status Breakdown
    booked: stats.booked,
    shipped: stats.shipped,
    inTransit: stats.inTransit,
    
    // Additional useful data
    uniqueDrivers: Array.from(stats.uniqueDrivers)
  };
}


