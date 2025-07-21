"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRouteStatus = exports.getRoutesByDateRange = exports.getActiveRoutes = exports.updateDriverLocation = exports.updateDeliveryProgress = exports.getRouteForShopOwner = exports.getRouteForDriver = void 0;
const RouteStorageService_1 = require("../services/RouteStorageService");
const routeStorageService = new RouteStorageService_1.RouteStorageService();
const getRouteForDriver = async (req, res) => {
    const { routeId, vehicleId } = req.params;
    if (!routeId || !vehicleId) {
        res.status(400).json({
            success: false,
            error: 'Missing required parameters: routeId and vehicleId'
        });
        return;
    }
    try {
        console.log(`🗺️ Getting route for driver: ${routeId}, vehicle: ${vehicleId}`);
        const route = await routeStorageService.getRouteForDriver(routeId, parseInt(vehicleId));
        if (!route) {
            res.status(404).json({
                success: false,
                error: 'Route not found or vehicle not assigned to this route'
            });
            return;
        }
        res.json({
            success: true,
            data: route,
            message: 'Route retrieved successfully for driver navigation'
        });
    }
    catch (error) {
        console.error('❌ Failed to get route for driver:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to get route for driver'
        });
    }
};
exports.getRouteForDriver = getRouteForDriver;
const getRouteForShopOwner = async (req, res) => {
    const { routeId } = req.params;
    if (!routeId) {
        res.status(400).json({
            success: false,
            error: 'Missing required parameter: routeId'
        });
        return;
    }
    try {
        console.log(`📊 Getting route for shop owner: ${routeId}`);
        const route = await routeStorageService.getRouteForShopOwner(routeId);
        if (!route) {
            res.status(404).json({
                success: false,
                error: 'Route not found'
            });
            return;
        }
        res.json({
            success: true,
            data: route,
            message: 'Route retrieved successfully for shop owner dashboard'
        });
    }
    catch (error) {
        console.error('❌ Failed to get route for shop owner:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to get route for shop owner'
        });
    }
};
exports.getRouteForShopOwner = getRouteForShopOwner;
const updateDeliveryProgress = async (req, res) => {
    const { routeId, vehicleId, locationId } = req.params;
    const { status, notes } = req.body;
    if (!routeId || !vehicleId || !locationId || !status) {
        res.status(400).json({
            success: false,
            error: 'Missing required parameters: routeId, vehicleId, locationId, or status'
        });
        return;
    }
    if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
        res.status(400).json({
            success: false,
            error: 'Invalid status. Must be one of: pending, in_progress, completed, failed'
        });
        return;
    }
    try {
        console.log(`📝 Updating delivery progress: ${routeId} - ${locationId} -> ${status}`);
        await routeStorageService.updateDeliveryProgress(routeId, parseInt(vehicleId), locationId, status, notes);
        res.json({
            success: true,
            data: { routeId, vehicleId, locationId, status, notes },
            message: 'Delivery progress updated successfully'
        });
    }
    catch (error) {
        console.error('❌ Failed to update delivery progress:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to update delivery progress'
        });
    }
};
exports.updateDeliveryProgress = updateDeliveryProgress;
const updateDriverLocation = async (req, res) => {
    const { routeId, vehicleId } = req.params;
    const { driverId, latitude, longitude, accuracy } = req.body;
    if (!routeId || !vehicleId || !driverId || latitude === undefined || longitude === undefined) {
        res.status(400).json({
            success: false,
            error: 'Missing required fields: routeId, vehicleId, driverId, latitude, or longitude'
        });
        return;
    }
    try {
        console.log(`📍 Updating driver location: ${routeId} - vehicle ${vehicleId}`);
        await routeStorageService.updateDriverLocation(routeId, parseInt(vehicleId), driverId, latitude, longitude, accuracy);
        res.json({
            success: true,
            data: { routeId, vehicleId, driverId, latitude, longitude, accuracy },
            message: 'Driver location updated successfully'
        });
    }
    catch (error) {
        console.error('❌ Failed to update driver location:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to update driver location'
        });
    }
};
exports.updateDriverLocation = updateDriverLocation;
const getActiveRoutes = async (req, res) => {
    try {
        console.log('📋 Getting all active routes');
        const routes = await routeStorageService.getActiveRoutes();
        res.json({
            success: true,
            data: routes,
            message: `Retrieved ${routes.length} active routes`
        });
    }
    catch (error) {
        console.error('❌ Failed to get active routes:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to get active routes'
        });
    }
};
exports.getActiveRoutes = getActiveRoutes;
const getRoutesByDateRange = async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        res.status(400).json({
            success: false,
            error: 'Missing required query parameters: startDate and endDate'
        });
        return;
    }
    try {
        console.log(`📅 Getting routes from ${startDate} to ${endDate}`);
        const routes = await routeStorageService.getRoutesByDateRange(startDate, endDate);
        res.json({
            success: true,
            data: routes,
            message: `Retrieved ${routes.length} routes for the specified date range`
        });
    }
    catch (error) {
        console.error('❌ Failed to get routes by date range:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to get routes by date range'
        });
    }
};
exports.getRoutesByDateRange = getRoutesByDateRange;
const updateRouteStatus = async (req, res) => {
    const { routeId } = req.params;
    const { status } = req.body;
    if (!routeId || !status) {
        res.status(400).json({
            success: false,
            error: 'Missing required parameters: routeId or status'
        });
        return;
    }
    if (!['active', 'completed', 'cancelled'].includes(status)) {
        res.status(400).json({
            success: false,
            error: 'Invalid status. Must be one of: active, completed, cancelled'
        });
        return;
    }
    try {
        console.log(`🔄 Updating route status: ${routeId} -> ${status}`);
        await routeStorageService.updateRouteStatus(routeId, status);
        res.json({
            success: true,
            data: { routeId, status },
            message: 'Route status updated successfully'
        });
    }
    catch (error) {
        console.error('❌ Failed to update route status:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to update route status'
        });
    }
};
exports.updateRouteStatus = updateRouteStatus;
//# sourceMappingURL=routeController.js.map