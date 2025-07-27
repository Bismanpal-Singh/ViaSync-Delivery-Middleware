import { Request, Response } from 'express';
import { DeliveryService } from '../services/DeliveryService';
import { SupabaseService } from '../services/SupabaseService';
import { config } from '../config/environment';
import { GeocodingService } from '../services/GeocodingService';

const deliveryService = new DeliveryService();
const supabaseService = new SupabaseService({
  url: config.supabase.url,
  key: config.supabase.anonKey
});
const geocodingService = new GeocodingService();

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
    console.error('❌ Route optimization failed:', error);
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
  const { fromDate, toDate, status, vehicleCapacities, depotAddress, limit, offset, startDate, startTime, date } = req.body;

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

    const result = await deliveryService.optimizeDeliveryRoutesFromDatabase({
      fromDate: finalFromDate,
      toDate: finalToDate,
      status,
      vehicleCapacities,
      depotAddress,
      limit,
      offset,
      startDate,
      startTime
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
  const { fromDate, toDate, status } = req.query;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  try {
    const deliveries = await supabaseService.getDeliveries({
      fromDate: fromDate as string,
      toDate: toDate as string,
      status: status as string,
      limit,
      offset
    });

    // Return a raw array as expected by the frontend
    res.json(deliveries);

  } catch (error) {
    console.error('❌ Failed to get deliveries:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
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

export const getPendingDeliveriesByDate = async (req: Request, res: Response): Promise<void> => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid date parameter' });
    return;
  }
  try {
    // Fetch all pending deliveries for the date (status: Booked or Pending)
    const deliveries = await supabaseService.getDeliveries({
      fromDate: date,
      toDate: date,
      status: 'Booked,Pending', // Pass as comma-separated for .in query in service
      limit: 200 // or whatever is reasonable
    });
    console.log(`🔎 Fetched ${deliveries.length} deliveries from Supabase for date ${date}`);
    if (deliveries.length > 0) {
      console.log('🔎 First 3 deliveries:', deliveries.slice(0, 3));
    }
    // For each delivery, get lat/lon from cache or geocode
    const results = await Promise.all(deliveries.map(async (d: any) => {
      const address = `${d.address_1}, ${d.city}, ${d.zip}`;
      console.log('🔎 Geocoding address:', address);
      const coords = await geocodingService.geocodeAddress(address);
      if (!coords) return null;
      return {
        id: d.id,
        address,
        latitude: coords.lat,
        longitude: coords.lon
      };
    }));
    // Only return deliveries with valid coordinates
    const filtered = results.filter((r) => !!r);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch pending deliveries', details: err instanceof Error ? err.message : String(err) });
  }
};


