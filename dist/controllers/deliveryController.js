"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeliveryStatus = exports.getDeliveryById = exports.getAllDeliveries = exports.healthCheck = exports.optimizeDeliveryFromDatabase = exports.optimizeDelivery = void 0;
const DeliveryService_1 = require("../services/DeliveryService");
const SupabaseService_1 = require("../services/SupabaseService");
const environment_1 = require("../config/environment");
const deliveryService = new DeliveryService_1.DeliveryService();
const supabaseService = new SupabaseService_1.SupabaseService({
    url: environment_1.config.supabase.url,
    key: environment_1.config.supabase.anonKey
});
const optimizeDelivery = async (req, res) => {
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
    }
    catch (error) {
        console.error('❌ Route optimization failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to optimize delivery routes'
        });
    }
};
exports.optimizeDelivery = optimizeDelivery;
const optimizeDeliveryFromDatabase = async (req, res) => {
    const { fromDate, toDate, status, numVehicles, depotAddress, limit, offset, startDate, startTime } = req.body;
    if (!numVehicles || numVehicles <= 0) {
        res.status(400).json({
            success: false,
            error: 'numVehicles is required and must be positive'
        });
        return;
    }
    if (startTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
        res.status(400).json({
            success: false,
            error: 'startTime must be in HH:MM format (e.g., "08:30")'
        });
        return;
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        res.status(400).json({
            success: false,
            error: 'startDate must be in YYYY-MM-DD format (e.g., "2024-01-15")'
        });
        return;
    }
    try {
        console.log(`🚚 Optimizing routes from database with ${numVehicles} vehicles`);
        if (startDate || startTime) {
            console.log(`⏰ Using custom start time: ${startDate || 'today'} at ${startTime || 'now'}`);
        }
        const result = await deliveryService.optimizeDeliveryRoutesFromDatabase({
            fromDate,
            toDate,
            status,
            numVehicles,
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
    }
    catch (error) {
        console.error('❌ Database route optimization failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to optimize delivery routes from database'
        });
    }
};
exports.optimizeDeliveryFromDatabase = optimizeDeliveryFromDatabase;
const healthCheck = async (_req, res) => {
    try {
        console.log('🏥 Health check endpoint hit');
        let supabaseStatus = 'unknown';
        try {
            await supabaseService.getRecentDeliveries(1);
            supabaseStatus = 'connected';
        }
        catch {
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
    }
    catch (error) {
        console.error('❌ Health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Service unhealthy',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.healthCheck = healthCheck;
const getAllDeliveries = async (req, res) => {
    const { fromDate, toDate, status } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    try {
        const deliveries = await supabaseService.getDeliveries({
            fromDate: fromDate,
            toDate: toDate,
            status: status,
            limit,
            offset
        });
        res.json(deliveries);
    }
    catch (error) {
        console.error('❌ Failed to get deliveries:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};
exports.getAllDeliveries = getAllDeliveries;
const getDeliveryById = async (req, res) => {
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
    }
    catch (error) {
        console.error('❌ Failed to get delivery by ID:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};
exports.getDeliveryById = getDeliveryById;
const updateDeliveryStatus = async (req, res) => {
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
    }
    catch (error) {
        console.error('❌ Failed to update delivery status:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};
exports.updateDeliveryStatus = updateDeliveryStatus;
//# sourceMappingURL=deliveryController.js.map