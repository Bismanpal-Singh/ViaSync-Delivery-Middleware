"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryService = void 0;
const SupabaseService_1 = require("./SupabaseService");
const HybridDistanceService_1 = require("./HybridDistanceService");
const GeocodingService_1 = require("./GeocodingService");
const OrToolsService_1 = require("./OrToolsService");
const RouteStorageService_1 = require("./RouteStorageService");
const uuid_1 = require("uuid");
class DeliveryService {
    constructor() {
        const config = {
            url: process.env.SUPABASE_URL,
            key: process.env.SUPABASE_ANON_KEY
        };
        this.supabaseService = new SupabaseService_1.SupabaseService(config);
        this.distanceMatrixService = new HybridDistanceService_1.HybridDistanceService();
        this.geocodingService = new GeocodingService_1.GeocodingService();
        this.orToolsService = new OrToolsService_1.OrToolsService();
        this.routeStorageService = new RouteStorageService_1.RouteStorageService();
    }
    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    getCustomStartTime(startDate, startTime) {
        const now = new Date();
        const targetDate = startDate ? new Date(startDate) : now;
        let targetTime;
        if (startTime) {
            targetTime = startTime;
        }
        else {
            targetTime = this.minutesToTime(now.getHours() * 60 + now.getMinutes());
        }
        const [hours, minutes] = targetTime.split(':').map(Number);
        const minutesFromMidnight = hours * 60 + minutes;
        return {
            date: targetDate.toISOString().split('T')[0],
            time: targetTime,
            minutesFromMidnight
        };
    }
    calculateRoughDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(deg) {
        return deg * (Math.PI / 180);
    }
    calculateTimeCompatibilityScore(cluster, newDelivery) {
        if (cluster.length === 0)
            return 0;
        const newStart = this.timeToMinutes(newDelivery.timeWindow.start);
        const newEnd = this.timeToMinutes(newDelivery.timeWindow.end);
        let totalCompatibilityScore = 0;
        let validComparisons = 0;
        for (const existingDelivery of cluster) {
            const existingStart = this.timeToMinutes(existingDelivery.timeWindow.start);
            const existingEnd = this.timeToMinutes(existingDelivery.timeWindow.end);
            const overlapStart = Math.max(newStart, existingStart);
            const overlapEnd = Math.min(newEnd, existingEnd);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            const newCenter = (newStart + newEnd) / 2;
            const existingCenter = (existingStart + existingEnd) / 2;
            const timeDistance = Math.abs(newCenter - existingCenter);
            const windowOverlapScore = Math.max(0, 60 - overlap);
            const timeDistanceScore = Math.min(timeDistance, 240);
            const compatibilityScore = windowOverlapScore + timeDistanceScore;
            totalCompatibilityScore += compatibilityScore;
            validComparisons++;
        }
        return validComparisons > 0 ? totalCompatibilityScore / validComparisons : 0;
    }
    async clusterDeliveriesForOptimization(depotAddress, deliveries, maxBatchSize = 9) {
        console.log(`🗺️ Clustering ${deliveries.length} deliveries into optimal batches of ${maxBatchSize}`);
        const allAddresses = [depotAddress, ...deliveries.map(d => d.address)];
        const geocodedAddresses = await Promise.all(allAddresses.map(addr => this.geocodingService.geocodeAddress(addr)));
        const failedGeocoding = geocodedAddresses.findIndex(coords => !coords);
        if (failedGeocoding !== -1) {
            throw new Error(`Failed to geocode address: ${allAddresses[failedGeocoding]}`);
        }
        const depotCoords = geocodedAddresses[0];
        const deliveryCoords = geocodedAddresses.slice(1);
        const distancesFromDepot = deliveryCoords.map((coords, index) => ({
            delivery: deliveries[index],
            coords: coords,
            distanceFromDepot: this.calculateRoughDistance(depotCoords.lat, depotCoords.lon, coords.lat, coords.lon)
        }));
        distancesFromDepot.sort((a, b) => a.distanceFromDepot - b.distanceFromDepot);
        const clusters = [];
        const usedDeliveries = new Set();
        while (usedDeliveries.size < deliveries.length) {
            const currentCluster = [];
            let seedDelivery = distancesFromDepot.find(d => !usedDeliveries.has(d.delivery.id));
            if (!seedDelivery)
                break;
            currentCluster.push(seedDelivery.delivery);
            usedDeliveries.add(seedDelivery.delivery.id);
            const clusterCoords = [seedDelivery.coords];
            while (currentCluster.length < maxBatchSize && usedDeliveries.size < deliveries.length) {
                let bestDelivery = null;
                let bestScore = Infinity;
                for (const deliveryData of distancesFromDepot) {
                    if (usedDeliveries.has(deliveryData.delivery.id))
                        continue;
                    const avgDistanceToCluster = clusterCoords.reduce((sum, coord) => {
                        return sum + this.calculateRoughDistance(coord.lat, coord.lon, deliveryData.coords.lat, deliveryData.coords.lon);
                    }, 0) / clusterCoords.length;
                    const geographicScore = avgDistanceToCluster * 0.5 + deliveryData.distanceFromDepot * 0.2;
                    const timeCompatibilityScore = this.calculateTimeCompatibilityScore(currentCluster, deliveryData.delivery);
                    const score = geographicScore + timeCompatibilityScore * 0.3;
                    if (score < bestScore) {
                        bestScore = score;
                        bestDelivery = deliveryData;
                    }
                }
                if (bestDelivery) {
                    currentCluster.push(bestDelivery.delivery);
                    clusterCoords.push(bestDelivery.coords);
                    usedDeliveries.add(bestDelivery.delivery.id);
                }
                else {
                    break;
                }
            }
            clusters.push(currentCluster);
        }
        console.log(`✅ Created ${clusters.length} optimized clusters:`);
        clusters.forEach((cluster, index) => {
            const totalDistance = cluster.reduce((sum, delivery) => {
                const deliveryData = distancesFromDepot.find(d => d.delivery.id === delivery.id);
                return sum + (deliveryData?.distanceFromDepot || 0);
            }, 0);
            console.log(`   Cluster ${index + 1}: ${cluster.length} deliveries, avg distance: ${(totalDistance / cluster.length / 1000).toFixed(1)}km`);
        });
        return clusters;
    }
    async getOptimalDeliveryClusters(depotAddress, deliveries, maxBatchSize = 9) {
        console.log(`🗺️ Creating optimal delivery clusters for pagination (${deliveries.length} deliveries)`);
        const clusters = await this.clusterDeliveriesForOptimization(depotAddress, deliveries, maxBatchSize);
        console.log(`✅ Created ${clusters.length} optimal clusters for pagination`);
        clusters.forEach((cluster, index) => {
            console.log(`   Cluster ${index + 1}: ${cluster.length} deliveries`);
        });
        return clusters;
    }
    async optimizeDeliveryRoutes(request, customStartTime) {
        try {
            console.log(`🚚 Optimizing delivery routes for ${request.deliveries.length} deliveries with ${request.numVehicles} vehicles`);
            let depotAddressStr;
            let depotTimeWindow = [420, 1440];
            if (typeof request.depotAddress === 'string') {
                depotAddressStr = request.depotAddress;
            }
            else {
                depotAddressStr = request.depotAddress.address;
                if (request.depotAddress.timeWindow) {
                    depotTimeWindow = [
                        this.timeToMinutes(request.depotAddress.timeWindow.start),
                        this.timeToMinutes(request.depotAddress.timeWindow.end)
                    ];
                }
            }
            if (customStartTime) {
                console.log(`⏰ Using custom start time: ${customStartTime.date} at ${customStartTime.time}`);
                depotTimeWindow = [customStartTime.minutesFromMidnight, 1440];
            }
            const allAddresses = [depotAddressStr, ...request.deliveries.map(d => d.address)];
            const geocodedAddresses = await Promise.all(allAddresses.map(addr => this.geocodingService.geocodeAddress(addr)));
            console.log('🗺️ Geocoded addresses:');
            geocodedAddresses.forEach((coords, idx) => {
                console.log(`   [${idx}] ${allAddresses[idx]} =>`, coords);
            });
            const failedGeocoding = geocodedAddresses.findIndex(coords => !coords);
            if (failedGeocoding !== -1) {
                throw new Error(`Failed to geocode address: ${allAddresses[failedGeocoding]}`);
            }
            const locationObjects = geocodedAddresses.map((coords, index) => ({
                lat: coords.lat,
                lon: coords.lon,
                type: index === 0 ? 'depot' : 'order',
                orderId: index === 0 ? undefined : index
            }));
            const matrixResult = await this.distanceMatrixService.getDistanceMatrix(locationObjects);
            if (!matrixResult) {
                throw new Error('Failed to get distance and time matrices');
            }
            const distanceMatrix = matrixResult.distances;
            const timeMatrix = matrixResult.matrix;
            console.log('🧮 Distance matrix (meters):', JSON.stringify(distanceMatrix, null, 2));
            console.log('⏱️ Time matrix (seconds):', JSON.stringify(timeMatrix, null, 2));
            const timeWindows = [[depotTimeWindow[0] * 60, depotTimeWindow[1] * 60]];
            for (const delivery of request.deliveries) {
                const startMinutes = this.timeToMinutes(delivery.timeWindow.start);
                const endMinutes = this.timeToMinutes(delivery.timeWindow.end);
                timeWindows.push([startMinutes * 60, endMinutes * 60]);
            }
            console.log('🕰️ Time windows (seconds from midnight):', JSON.stringify(timeWindows));
            const solverData = {
                num_vehicles: request.numVehicles,
                depot: 0,
                distance_matrix: distanceMatrix,
                time_matrix: timeMatrix,
                time_windows: timeWindows
            };
            console.log('🧪 Debug Preview:');
            console.log('   ➤ Sample travel time (0→1):', timeMatrix[0][1]);
            console.log('   ➤ Sample time window:', timeWindows[1]);
            console.log('🔍 Solver data:', JSON.stringify(solverData, null, 2));
            const solverResult = await this.orToolsService.solveVRPTW(solverData);
            if (solverResult.error) {
                throw new Error(`Solver failed: ${solverResult.error}`);
            }
            if (!solverResult.routes || solverResult.routes.length === 0) {
                throw new Error('No feasible routes found');
            }
            const routes = solverResult.routes.map(solverRoute => {
                const stops = solverRoute.route.map((nodeIndex, stopIndex) => {
                    if (nodeIndex === 0) {
                        return {
                            locationId: 'depot',
                            address: typeof request.depotAddress === 'string'
                                ? request.depotAddress
                                : request.depotAddress.address,
                            eta: stopIndex === 0 ? this.calculateDepartureTime(solverRoute, timeMatrix) :
                                this.minutesToTime(this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix)),
                            timeWindow: {
                                start: this.minutesToTime(depotTimeWindow[0]),
                                end: this.minutesToTime(depotTimeWindow[1])
                            }
                        };
                    }
                    else {
                        const delivery = request.deliveries[nodeIndex - 1];
                        const arrivalTime = this.calculateArrivalTime(solverRoute, stopIndex, timeMatrix);
                        return {
                            locationId: delivery.id,
                            address: delivery.address,
                            eta: this.minutesToTime(arrivalTime),
                            timeWindow: delivery.timeWindow
                        };
                    }
                });
                return {
                    vehicleId: solverRoute.vehicle_id + 1,
                    stops,
                    departureTime: this.calculateDepartureTime(solverRoute, timeMatrix, customStartTime),
                    totalDistance: Math.round(solverRoute.distance),
                    totalTime: Math.round(solverRoute.time / 60)
                };
            });
            const result = {
                routes,
                totalDistance: Math.round(solverResult.total_distance || 0),
                totalTime: Math.round((solverResult.total_time || 0) / 60),
                numVehiclesUsed: solverResult.num_vehicles_used || routes.length
            };
            try {
                const routeId = (0, uuid_1.v4)();
                const routeName = `Route ${new Date().toLocaleDateString()} - ${request.deliveries.length} deliveries`;
                const deliveryDate = new Date().toISOString().split('T')[0];
                const depotAddress = typeof request.depotAddress === 'string'
                    ? request.depotAddress
                    : request.depotAddress.address;
                await this.routeStorageService.storeRoute({
                    id: routeId,
                    routeName,
                    deliveryDate,
                    depotAddress,
                    numVehicles: request.numVehicles,
                    numVehiclesUsed: result.numVehiclesUsed,
                    totalDistance: result.totalDistance,
                    totalTime: result.totalTime,
                    routes: result.routes
                });
                console.log(`💾 Route stored with ID: ${routeId}`);
            }
            catch (storageError) {
                console.warn('⚠️ Failed to store route:', storageError);
            }
            return result;
        }
        catch (error) {
            console.error('Error optimizing delivery routes:', error);
            throw error;
        }
    }
    calculateArrivalTime(route, stopIndex, timeMatrix) {
        const arrivalTimeSeconds = route.arrival_times?.[stopIndex] || 0;
        return Math.round(arrivalTimeSeconds / 60);
    }
    calculateDepartureTime(route, timeMatrix, customStartTime) {
        if (customStartTime) {
            return customStartTime.time;
        }
        const firstDeliveryIndex = route.route.findIndex((node) => node !== 0);
        if (firstDeliveryIndex === -1 || firstDeliveryIndex === 0) {
            return 'N/A';
        }
        const firstDeliveryNode = route.route[firstDeliveryIndex];
        const travelTimeToFirstDelivery = timeMatrix[0][firstDeliveryNode] + 600;
        const arrivalTimeAtFirstDelivery = route.arrival_times?.[firstDeliveryIndex] || 0;
        const departureTimeSeconds = arrivalTimeAtFirstDelivery - travelTimeToFirstDelivery;
        const departureTimeMinutes = Math.round(departureTimeSeconds / 60);
        return this.minutesToTime(departureTimeMinutes);
    }
    async optimizeDeliveryRoutesFromDatabase(params) {
        try {
            console.log(`🚚 Optimizing delivery routes from database with ${params.numVehicles} vehicles`);
            const deliveries = await this.supabaseService.getDeliveries({
                fromDate: params.fromDate,
                toDate: params.toDate,
                status: params.status,
                limit: params.limit || 100,
                offset: params.offset || 0
            });
            if (deliveries.length === 0) {
                throw new Error('No deliveries found for the specified criteria');
            }
            console.log(`📦 Found ${deliveries.length} deliveries to optimize`);
            const shopLocation = await this.supabaseService.getShopLocation();
            const depotAddress = params.depotAddress || shopLocation;
            const deliveryLocations = deliveries.map((delivery, index) => {
                let startTime = delivery.priority_start_time || '09:00';
                let endTime = delivery.priority_end_time || '17:00';
                if (startTime === endTime) {
                    endTime = '23:59';
                }
                const startMinutes = this.timeToMinutes(startTime);
                const endMinutes = this.timeToMinutes(endTime);
                if (endMinutes - startMinutes < 30) {
                    endTime = this.minutesToTime(Math.min(1440, startMinutes + 30));
                }
                return {
                    id: delivery.id.toString(),
                    address: this.supabaseService.formatDeliveryAddress(delivery),
                    timeWindow: {
                        start: startTime,
                        end: endTime
                    }
                };
            });
            const customStartTime = params.startDate || params.startTime ?
                this.getCustomStartTime(params.startDate, params.startTime) :
                undefined;
            const optimizationRequest = {
                depotAddress: {
                    address: depotAddress,
                    timeWindow: {
                        start: "07:00",
                        end: "23:59"
                    }
                },
                deliveries: deliveryLocations,
                numVehicles: params.numVehicles
            };
            console.log(`🚀 Global optimization for ALL ${deliveryLocations.length} deliveries with ${params.numVehicles} vehicles`);
            let result = await this.optimizeDeliveryRoutes(optimizationRequest, customStartTime);
            try {
                const routeId = (0, uuid_1.v4)();
                const routeName = `Database Route ${params.fromDate || 'all'} - ${deliveries.length} deliveries`;
                const deliveryDate = customStartTime?.date || params.fromDate || new Date().toISOString().split('T')[0];
                const depotAddressStr = depotAddress;
                const finalRouteName = customStartTime ?
                    `${routeName} (Start: ${customStartTime.time})` :
                    routeName;
                await this.routeStorageService.storeRoute({
                    id: routeId,
                    routeName: finalRouteName,
                    deliveryDate,
                    depotAddress,
                    numVehicles: params.numVehicles,
                    numVehiclesUsed: result.numVehiclesUsed,
                    totalDistance: result.totalDistance,
                    totalTime: result.totalTime,
                    routes: result.routes
                });
                console.log(`💾 Database route stored with ID: ${routeId}`);
                if (customStartTime) {
                    console.log(`⏰ Route uses custom start time: ${customStartTime.date} at ${customStartTime.time}`);
                }
            }
            catch (storageError) {
                console.warn('⚠️ Failed to store database route:', storageError);
            }
            return result;
        }
        catch (error) {
            console.error('Error optimizing delivery routes from database:', error);
            throw error;
        }
    }
}
exports.DeliveryService = DeliveryService;
//# sourceMappingURL=DeliveryService.js.map