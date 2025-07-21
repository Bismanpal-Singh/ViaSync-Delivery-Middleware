"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteStorageService = void 0;
const sqlite3 = __importStar(require("sqlite3"));
const path = __importStar(require("path"));
class RouteStorageService {
    constructor() {
        this.dbPath = path.join(__dirname, '../../data/route_storage.db');
        this.initDatabase();
    }
    initDatabase() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Error opening route storage database:', err);
            }
            else {
                console.log('✅ Route storage database connected');
                this.createTables();
            }
        });
    }
    createTables() {
        const routesTable = `
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        route_name TEXT NOT NULL,
        delivery_date TEXT NOT NULL,
        depot_address TEXT NOT NULL,
        num_vehicles INTEGER NOT NULL,
        num_vehicles_used INTEGER NOT NULL,
        total_distance REAL NOT NULL,
        total_time INTEGER NOT NULL,
        route_data TEXT NOT NULL,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_driver TEXT,
        driver_notes TEXT,
        shop_notes TEXT
      )
    `;
        const progressTable = `
      CREATE TABLE IF NOT EXISTS route_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id TEXT NOT NULL,
        vehicle_id INTEGER NOT NULL,
        stop_location_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
        actual_arrival_time TEXT,
        actual_departure_time TEXT,
        driver_notes TEXT,
        customer_signature TEXT,
        photo_proof TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
      )
    `;
        const locationTable = `
      CREATE TABLE IF NOT EXISTS driver_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id TEXT NOT NULL,
        vehicle_id INTEGER NOT NULL,
        driver_id TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        accuracy REAL,
        speed REAL,
        heading REAL,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
      )
    `;
        this.db.serialize(() => {
            this.db.run(routesTable, (err) => {
                if (err) {
                    console.error('❌ Error creating routes table:', err);
                }
                else {
                    console.log('✅ Routes table ready');
                }
            });
            this.db.run(progressTable, (err) => {
                if (err) {
                    console.error('❌ Error creating route_progress table:', err);
                }
                else {
                    console.log('✅ Route progress table ready');
                }
            });
            this.db.run(locationTable, (err) => {
                if (err) {
                    console.error('❌ Error creating driver_locations table:', err);
                }
                else {
                    console.log('✅ Driver locations table ready');
                }
            });
        });
    }
    async storeRoute(routeData) {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT OR REPLACE INTO routes (
          id, route_name, delivery_date, depot_address, num_vehicles, 
          num_vehicles_used, total_distance, total_time, route_data, 
          assigned_driver, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
            const routeDataJson = JSON.stringify(routeData.routes);
            this.db.run(sql, [
                routeData.id,
                routeData.routeName,
                routeData.deliveryDate,
                routeData.depotAddress,
                routeData.numVehicles,
                routeData.numVehiclesUsed,
                routeData.totalDistance,
                routeData.totalTime,
                routeDataJson,
                routeData.assignedDriver || null
            ], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log(`✅ Stored route: ${routeData.id}`);
                    resolve();
                }
            });
        });
    }
    async getRouteForDriver(routeId, vehicleId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM routes WHERE id = ?';
            this.db.get(sql, [routeId], (err, row) => {
                if (err) {
                    reject(err);
                }
                else if (!row) {
                    resolve(null);
                }
                else {
                    try {
                        const storedRoute = row;
                        const routeData = JSON.parse(storedRoute.route_data);
                        const vehicleRoute = routeData.find((r) => r.vehicleId === vehicleId);
                        if (!vehicleRoute) {
                            resolve(null);
                        }
                        this.getVehicleProgress(routeId, vehicleId).then(progress => {
                            const routeForDriver = {
                                routeId: storedRoute.id,
                                routeName: storedRoute.route_name,
                                deliveryDate: storedRoute.delivery_date,
                                depotAddress: storedRoute.depot_address,
                                vehicleId: vehicleRoute.vehicleId,
                                stops: vehicleRoute.stops.map((stop, index) => ({
                                    ...stop,
                                    status: progress.find(p => p.stop_location_id === stop.locationId)?.status || 'pending'
                                })),
                                totalDistance: vehicleRoute.totalDistance,
                                totalTime: vehicleRoute.totalTime,
                                navigationData: {
                                    waypoints: vehicleRoute.stops.map((stop) => ({
                                        address: stop.address,
                                        coordinates: stop.coordinates || { lat: 0, lng: 0 }
                                    }))
                                }
                            };
                            resolve(routeForDriver);
                        }).catch(reject);
                    }
                    catch (parseErr) {
                        reject(parseErr);
                    }
                }
            });
        });
    }
    async getRouteForShopOwner(routeId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM routes WHERE id = ?';
            this.db.get(sql, [routeId], (err, row) => {
                if (err) {
                    reject(err);
                }
                else if (!row) {
                    resolve(null);
                }
                else {
                    try {
                        const storedRoute = row;
                        const routeData = JSON.parse(storedRoute.route_data);
                        const progress = this.getAllProgress(routeId);
                        const driverLocations = this.getLatestDriverLocations(routeId);
                        Promise.all([progress, driverLocations]).then(([progressData, locationData]) => {
                            const routes = routeData.map((vehicleRoute) => {
                                const vehicleProgress = progressData.filter(p => p.vehicle_id === vehicleRoute.vehicleId);
                                const vehicleLocation = locationData.find(l => l.vehicle_id === vehicleRoute.vehicleId);
                                return {
                                    vehicleId: vehicleRoute.vehicleId,
                                    driverName: storedRoute.assigned_driver,
                                    stops: vehicleRoute.stops.map((stop) => {
                                        const stopProgress = vehicleProgress.find(p => p.stop_location_id === stop.locationId);
                                        return {
                                            ...stop,
                                            status: stopProgress?.status || 'pending',
                                            actualArrivalTime: stopProgress?.actual_arrival_time,
                                            actualDepartureTime: stopProgress?.actual_departure_time
                                        };
                                    }),
                                    totalDistance: vehicleRoute.totalDistance,
                                    totalTime: vehicleRoute.totalTime,
                                    currentLocation: vehicleLocation ? {
                                        lat: vehicleLocation.latitude,
                                        lng: vehicleLocation.longitude
                                    } : undefined,
                                    estimatedReturnTime: this.calculateReturnTime(vehicleRoute, vehicleProgress)
                                };
                            });
                            const summary = this.calculateSummary(routes);
                            const routeForShopOwner = {
                                routeId: storedRoute.id,
                                routeName: storedRoute.route_name,
                                deliveryDate: storedRoute.delivery_date,
                                depotAddress: storedRoute.depot_address,
                                routes,
                                summary,
                                status: storedRoute.status,
                                createdAt: storedRoute.created_at,
                                updatedAt: storedRoute.updated_at
                            };
                            resolve(routeForShopOwner);
                        }).catch(reject);
                    }
                    catch (parseErr) {
                        reject(parseErr);
                    }
                }
            });
        });
    }
    async updateDeliveryProgress(routeId, vehicleId, locationId, status, notes) {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT OR REPLACE INTO route_progress (
          route_id, vehicle_id, stop_location_id, status, 
          actual_arrival_time, actual_departure_time, driver_notes, updated_at
        ) VALUES (?, ?, ?, ?, 
          CASE WHEN ? = 'in_progress' THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
          ?, CURRENT_TIMESTAMP
        )
      `;
            this.db.run(sql, [
                routeId, vehicleId, locationId, status, status, status, notes || null
            ], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log(`✅ Updated progress: ${routeId} - ${locationId} -> ${status}`);
                    resolve();
                }
            });
        });
    }
    async updateDriverLocation(routeId, vehicleId, driverId, lat, lng, accuracy) {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT INTO driver_locations (
          route_id, vehicle_id, driver_id, latitude, longitude, accuracy, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
            this.db.run(sql, [routeId, vehicleId, driverId, lat, lng, accuracy || null], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getActiveRoutes() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM routes WHERE status = "active" ORDER BY delivery_date DESC, created_at DESC';
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getRoutesByDateRange(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM routes WHERE delivery_date BETWEEN ? AND ? ORDER BY delivery_date DESC';
            this.db.all(sql, [startDate, endDate], (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async updateRouteStatus(routeId, status) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE routes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(sql, [status, routeId], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log(`✅ Updated route status: ${routeId} -> ${status}`);
                    resolve();
                }
            });
        });
    }
    async getVehicleProgress(routeId, vehicleId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM route_progress WHERE route_id = ? AND vehicle_id = ?';
            this.db.all(sql, [routeId, vehicleId], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
    async getAllProgress(routeId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM route_progress WHERE route_id = ?';
            this.db.all(sql, [routeId], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
    async getLatestDriverLocations(routeId) {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT dl.* FROM driver_locations dl
        INNER JOIN (
          SELECT vehicle_id, MAX(timestamp) as max_timestamp
          FROM driver_locations 
          WHERE route_id = ?
          GROUP BY vehicle_id
        ) latest ON dl.vehicle_id = latest.vehicle_id AND dl.timestamp = latest.max_timestamp
        WHERE dl.route_id = ?
      `;
            this.db.all(sql, [routeId, routeId], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
    calculateReturnTime(vehicleRoute, progress) {
        const completedStops = progress.filter(p => p.status === 'completed').length;
        const remainingStops = vehicleRoute.stops.length - completedStops - 1;
        const estimatedMinutes = remainingStops * 15 + 30;
        const now = new Date();
        const returnTime = new Date(now.getTime() + estimatedMinutes * 60000);
        return returnTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
    calculateSummary(routes) {
        const totalDeliveries = routes.reduce((sum, route) => sum + route.stops.filter((stop) => stop.locationId !== 'depot').length, 0);
        const completedDeliveries = routes.reduce((sum, route) => sum + route.stops.filter((stop) => stop.locationId !== 'depot' && stop.status === 'completed').length, 0);
        const pendingDeliveries = totalDeliveries - completedDeliveries;
        return {
            totalDeliveries,
            totalDistance: routes.reduce((sum, route) => sum + route.totalDistance, 0),
            totalTime: routes.reduce((sum, route) => sum + route.totalTime, 0),
            numVehiclesUsed: routes.length,
            completedDeliveries,
            pendingDeliveries
        };
    }
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('❌ Error closing route storage database:', err);
            }
            else {
                console.log('✅ Route storage database closed');
            }
        });
    }
}
exports.RouteStorageService = RouteStorageService;
//# sourceMappingURL=RouteStorageService.js.map