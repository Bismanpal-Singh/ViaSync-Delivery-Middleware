import { Request, Response } from 'express';
import { DeliveryService } from '../services/DeliveryService';
import { SupabaseService } from '../services/SupabaseService';
import { config } from '../config/environment';

const deliveryService = new DeliveryService();
const supabaseService = new SupabaseService({
  url: config.supabase.url,
  key: config.supabase.anonKey
});

export const optimizeDelivery = async (req: Request, res: Response): Promise<void> => {
  const { depotAddress, deliveries, numVehicles } = req.body;

  if (!depotAddress || !deliveries || !numVehicles) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: depotAddress, deliveries, or numVehicles'
    });
    return;
  }

  if (deliveries.length === 0 || numVehicles <= 0) {
    res.status(400).json({
      success: false,
      error: 'At least one delivery and a positive number of vehicles are required'
    });
    return;
  }

  try {
    console.log(`🚚 Optimizing ${deliveries.length} deliveries with ${numVehicles} vehicles`);

    const result = await deliveryService.optimizeDeliveryRoutes({
      depotAddress,
      deliveries,
      numVehicles
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

export const getDeliveryQuotes = async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

  try {
    const result = await deliveryService.getDeliveryQuotes(status, limit);
    res.json(result);
  } catch (error) {
    console.error('❌ Failed to get delivery quotes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
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
