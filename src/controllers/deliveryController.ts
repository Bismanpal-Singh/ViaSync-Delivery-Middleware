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
  const { 
    depotAddress, 
    deliveries, 
    vehicleCapacities, 
    serviceTimeMinutes,
    fromDate,
    toDate,
    startDate,
    startTime,
    limit,
    offset
  } = req.body;



  if (!deliveries || !vehicleCapacities) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: deliveries or vehicleCapacities',
      debug: {
        hasDeliveries: !!deliveries,
        hasVehicleCapacities: !!vehicleCapacities
      }
    });
    return;
  }

  if (deliveries.length === 0 || !Array.isArray(vehicleCapacities) || vehicleCapacities.length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one delivery and a non-empty vehicleCapacities array are required',
      debug: {
        deliveriesLength: deliveries?.length,
        isVehicleCapacitiesArray: Array.isArray(vehicleCapacities),
        vehicleCapacitiesLength: vehicleCapacities?.length
      }
    });
    return;
  }

  try {
    // Convert frontend delivery format to optimization format
    let optimizationDeliveries: any[];
    try {
      optimizationDeliveries = deliveries.map((delivery: any) => {
        // Handle the exact format the frontend is sending
        const deliveryId = delivery.id?.toString();
        
        // Build address from individual fields (frontend format)
        const address = delivery.address_1 && delivery.city && delivery.zip ? 
          `${delivery.address_1}, ${delivery.city}, ${delivery.zip}` : 
          delivery.address || delivery.shipping_address1 || 'Unknown Address';
        
        // Handle time windows from frontend format
        let startTime = delivery.priority_start_time || '09:00';
        let endTime = delivery.priority_end_time || '17:00';
        
        // If start and end times are the same, it means "any time during the day" (no priority window)
        if (startTime === endTime) {
          startTime = '07:00'; // Start of business day
          endTime = '23:59';   // End of day
        }

        return {
          id: deliveryId || `delivery-${Math.random()}`,
          address: address,
          timeWindow: {
            start: startTime,
            end: endTime
          },
          originalDelivery: delivery // Preserve original data for orders array
        };
      });
    } catch (conversionError) {
      console.error('❌ Error converting deliveries:', conversionError);
      res.status(400).json({
        success: false,
        error: 'Failed to convert delivery data format',
        message: 'Error processing delivery data'
      });
      return;
    }



    // Validate converted deliveries
    const invalidDeliveries = optimizationDeliveries.filter((d: any) => !d.address || d.address === 'Unknown Address');
    if (invalidDeliveries.length > 0) {
      console.error('❌ Invalid deliveries found:', invalidDeliveries);
      res.status(400).json({
        success: false,
        error: `${invalidDeliveries.length} deliveries have invalid addresses`,
        message: 'Some deliveries could not be processed due to missing address information'
      });
      return;
    }

    // Get depot address - use provided one or get from shop location
    let finalDepotAddress = depotAddress;
    if (!finalDepotAddress) {
      // If no depot address provided, get it from the user context or use default
      // For now, we'll use a default since we don't have user context in this endpoint
      finalDepotAddress = 'GTS Flowers Inc, 8002 Concord Hwy, Monroe, NC 28110';
    }

    console.log('🔍 OPTIMIZE DEBUG: Using depot address:', finalDepotAddress);
    console.log('🔍 OPTIMIZE DEBUG: Calling optimization service with:', {
      depotAddress: finalDepotAddress,
      deliveryCount: optimizationDeliveries.length,
      vehicleCapacities,
      serviceTimeMinutes: serviceTimeMinutes || 10
    });

    // Optimizing deliveries
    const result = await deliveryService.optimizeDeliveryRoutes({
      depotAddress: finalDepotAddress,
      deliveries: optimizationDeliveries,
      vehicleCapacities,
      serviceTimeMinutes: serviceTimeMinutes || 10
    });

    res.json({
      success: true,
      data: result,
      message: `Successfully generated ${result.routes.length} routes`
    });

  } catch (error) {
    console.error('❌ Route optimization failed:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to optimize delivery routes',
      debug: {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
  }
};

/**
 * Optimize delivery routes from database using the same filtering logic as GET /api/delivery/pending
 * This ensures that the optimization uses the exact same deliveries that the user sees on the frontend
 */
export const optimizeDeliveryFromDatabase = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, status, vehicleCapacities, depotAddress, limit, offset, startDate, startTime, date, serviceTimeMinutes, locationId } = req.body;

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
    // Using single date parameter
  }

  try {
    // Get user context from request (set by auth middleware)
    const userContext = req.user;

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
      locationId,
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
    // Health check endpoint

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
  const { fromDate, toDate, status, date, locationId } = req.query;
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
        console.log(`🔄 getAllDeliveries: Fetching deliveries for date=${date}, companyId=${userContext.companyId}`);
        // Get deliveries with sync using authenticated user context
        // For the deliveries-by-date endpoint, get all statuses (not just specific status)
        deliveries = await deliveryService.getDeliveriesForDate(date, limit, userContext, undefined, typeof locationId === 'string' ? locationId : undefined);
        console.log(`📦 getAllDeliveries: Retrieved ${deliveries?.length || 0} deliveries`);
      } catch (error) {
        console.error('❌ Failed to get deliveries:', error);
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
        companyId: userContext?.companyId,
        locationId: typeof locationId === 'string' ? locationId : undefined
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

/**
 * Bulk update delivery statuses for multiple deliveries at once
 * Used when generating trip sheets to mark all deliveries as "Routed"
 */
export const bulkUpdateDeliveryStatus = async (req: Request, res: Response): Promise<void> => {
  const { deliveryIds, status } = req.body;
  const userContext = req.user;

  // Validate request
  if (!Array.isArray(deliveryIds) || deliveryIds.length === 0) {
    res.status(400).json({ 
      success: false, 
      error: 'deliveryIds must be a non-empty array' 
    });
    return;
  }

  if (!status || typeof status !== 'string') {
    res.status(400).json({ 
      success: false, 
      error: 'status is required and must be a string' 
    });
    return;
  }

  // Validate all delivery IDs are numbers
  if (deliveryIds.some(id => !Number.isInteger(id) || id <= 0)) {
    res.status(400).json({ 
      success: false, 
      error: 'All deliveryIds must be positive integers' 
    });
    return;
  }

  try {
    console.log(`🔄 Bulk updating ${deliveryIds.length} deliveries to status: ${status}`);
    
    // Update statuses in Supabase
    const updateResult = await supabaseService.updateOrderStatus(deliveryIds, status);
    
    console.log(`✅ Bulk update completed:`, {
      requested: deliveryIds.length,
      updated: updateResult.updated,
      failed: updateResult.failed
    });

    // TODO: If needed, sync status changes back to QuickFlora API
    // This would require implementing a method to update QuickFlora order statuses
    // For now, we're only updating the local Supabase database

    res.json({
      success: true,
      data: {
        requested: deliveryIds.length,
        updated: updateResult.updated,
        failed: updateResult.failed,
        status: status
      },
      message: `Successfully updated ${updateResult.updated} out of ${deliveryIds.length} deliveries to ${status}`
    });

  } catch (error) {
    console.error('❌ Failed to bulk update delivery statuses:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to bulk update delivery statuses'
    });
  }
};

export const getPendingDeliveriesWithCoords = async (req: Request, res: Response): Promise<void> => {
  const { date, locationId } = req.query;
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
      limit: 500,
      locationId: typeof locationId === 'string' ? locationId : undefined
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
  const { date, locationId } = req.query;
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
      locationId: typeof locationId === 'string' ? locationId : undefined,
      returnData: true // Return data directly
    });

    // Step 2: Sync the fetched data to Supabase with company ID
    let syncResult = null;
    if (Array.isArray(allDeliveries) && allDeliveries.length > 0) {
      syncResult = await supabaseService.syncWithQuickFlora(allDeliveries, userContext.companyId);
    }

    // Step 3: Read back from Supabase so stats reflect local updates (e.g., Routed)
    const deliveries = await supabaseService.getDeliveries({
      fromDate: targetDate,
      toDate: targetDate,
      status: undefined,
      companyId: userContext.companyId,
      locationId: typeof locationId === 'string' ? locationId : undefined,
      limit: 2000
    });

    // Calculate detailed stats using the same function
    const stats = calculateDashboardStats(deliveries);
    
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
    inProgress: 0, // Shipped + Picked + In Transit
    activeDrivers: 0,
    
    // Performance Overview
    completionRate: 0,
    remaining: 0,
    urgentDeliveries: 0,
    
    // Individual Status Breakdown (all possible statuses)
    booked: 0,
    shipped: 0,
    invoiced: 0,
    picked: 0,
    returned: 0,
    inTransit: 0,
    routed: 0, // For orders marked as routed by trip sheet generation
    unknown: 0, // For any other statuses
    
    // Driver tracking
    uniqueDrivers: new Set<string>()
  };

  let debugCounter = 0;
  deliveries.forEach(delivery => {
    // Debug: Log the first few deliveries to see what fields contain status info
    if (debugCounter < 3) {
      console.log(`📊 Debug delivery ${debugCounter + 1}:`, {
        order_status: delivery.order_status,
        allStatusFields: Object.keys(delivery).filter(key => key.toLowerCase().includes('status'))
      });
    }
    debugCounter++;
    
    // Use only order_status in DB; fallback to OrderStatus from API if present in memory
    const rawStatus = delivery.order_status || delivery.OrderStatus || 'Unknown';
    let status = rawStatus.toString().toLowerCase();
    // No ShowRoute mapping; strictly use OrderStatus
    
    const priority = delivery.priority || '';
    const assignedTo = delivery.assigned_to;

    // Count by status (using exact status names you provided)
    switch (status) {
      case 'delivered':
        stats.delivered++;
        break;
      case 'shipped':
        stats.shipped++;
        stats.inProgress++;
        break;
      case 'invoiced':
        stats.invoiced++;
        break;
      case 'booked':
        stats.booked++;
        break;
      case 'picked':
        stats.picked++;
        stats.inProgress++;
        break;
      case 'returned':
        stats.returned++;
        break;
      case 'routed':
        stats.routed++;
        break;
      case 'in transit':
        stats.inTransit++;
        stats.inProgress++;
        break;
      default:
        stats.unknown++;
        if (stats.unknown <= 5) { // Only log first 5 unknown statuses to avoid spam
          console.log(`📊 Unknown status found: "${status}" (original: "${rawStatus}")`);
        }
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
    
    // Individual Status Breakdown
    booked: stats.booked,
    shipped: stats.shipped,
    invoiced: stats.invoiced,
    picked: stats.picked,
    returned: stats.returned,
    routed: stats.routed,
    inTransit: stats.inTransit,
    unknown: stats.unknown,
    
    // Additional useful data
    uniqueDrivers: Array.from(stats.uniqueDrivers)
  };
}


