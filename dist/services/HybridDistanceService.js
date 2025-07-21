"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridDistanceService = void 0;
const DistanceMatrixService_1 = require("./DistanceMatrixService");
const OSRMService_1 = require("./OSRMService");
class HybridDistanceService {
    constructor() {
        this.googleService = new DistanceMatrixService_1.DistanceMatrixService();
        this.osrmService = new OSRMService_1.OSRMService();
    }
    async getDistanceMatrix(locations) {
        const numLocations = locations.length;
        if (numLocations <= 10) {
            console.log(`📊 Using Google Maps for ${numLocations} locations (≤10 limit)`);
            return await this.googleService.getDistanceMatrix(locations);
        }
        console.log(`📊 Using OSRM for ${numLocations} locations (>10 limit)`);
        return await this.osrmService.getDistanceMatrix(locations);
    }
    async testServices() {
        const testLocations = [
            { lat: 34.7465, lon: -92.2896, type: 'depot' },
            { lat: 34.7465, lon: -92.2896, type: 'order' }
        ];
        const google = await this.googleService.getDistanceMatrix(testLocations) !== null;
        const osrm = await this.osrmService.testConnection();
        return { google, osrm };
    }
}
exports.HybridDistanceService = HybridDistanceService;
//# sourceMappingURL=HybridDistanceService.js.map