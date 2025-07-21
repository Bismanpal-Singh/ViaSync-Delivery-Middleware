"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OSRMService = void 0;
const axios_1 = __importDefault(require("axios"));
class OSRMService {
    constructor() {
        this.baseUrl = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
    }
    async getDistanceMatrix(locations) {
        try {
            const coordinates = locations.map(loc => `${loc.lon},${loc.lat}`).join(';');
            console.log(`🔍 OSRM Request: ${locations.length} locations`);
            const response = await axios_1.default.get(`${this.baseUrl}/table/v1/driving/${coordinates}`, {
                params: {
                    annotations: 'distance,duration'
                }
            });
            if (response.data.code !== 'Ok') {
                console.error('OSRM API returned error:', response.data.code);
                return null;
            }
            const distances = response.data.distances;
            const durations = response.data.durations;
            const matrix = [];
            const distanceMatrix = [];
            for (let i = 0; i < locations.length; i++) {
                matrix[i] = [];
                distanceMatrix[i] = [];
                for (let j = 0; j < locations.length; j++) {
                    matrix[i][j] = durations[i][j];
                    distanceMatrix[i][j] = distances[i][j];
                }
            }
            return {
                origins: locations.map(loc => `${loc.lat},${loc.lon}`),
                destinations: locations.map(loc => `${loc.lat},${loc.lon}`),
                matrix,
                distances: distanceMatrix
            };
        }
        catch (error) {
            console.error('OSRM API error:', error);
            return null;
        }
    }
    async testConnection() {
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/route/v1/driving/-92.2896,34.7465;-92.2896,34.7465`);
            return response.data.code === 'Ok';
        }
        catch (error) {
            console.error('OSRM connection test failed:', error);
            return false;
        }
    }
}
exports.OSRMService = OSRMService;
//# sourceMappingURL=OSRMService.js.map