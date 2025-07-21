"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistanceMatrixService = void 0;
const axios_1 = __importDefault(require("axios"));
class DistanceMatrixService {
    constructor() {
        this.baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key) {
            throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
    }
    async getDistanceMatrix(locations) {
        try {
            const coordinates = locations.map(loc => `${loc.lat},${loc.lon}`);
            const joinedCoords = coordinates.join('|');
            const response = await axios_1.default.get(this.baseUrl, {
                params: {
                    origins: joinedCoords,
                    destinations: joinedCoords,
                    departure_time: 'now',
                    traffic_model: 'best_guess',
                    key: this.apiKey
                }
            });
            if (response.data.status !== 'OK') {
                console.error('Google API returned error:', response.data.status);
                return null;
            }
            const matrix = [];
            const distances = [];
            response.data.rows.forEach((row, i) => {
                matrix[i] = [];
                distances[i] = [];
                row.elements.forEach((element, j) => {
                    if (element.status === 'OK') {
                        const travelTime = element.duration_in_traffic?.value || element.duration.value;
                        matrix[i][j] = travelTime;
                        distances[i][j] = element.distance.value;
                    }
                    else {
                        const fallback = this.estimateFallbackDistance(locations[i], locations[j]);
                        matrix[i][j] = fallback / 10;
                        distances[i][j] = fallback;
                    }
                });
            });
            return {
                origins: coordinates,
                destinations: coordinates,
                matrix,
                distances
            };
        }
        catch (error) {
            console.error('Distance Matrix API error:', error);
            return null;
        }
    }
    estimateFallbackDistance(a, b) {
        return this.haversine(a.lat, a.lon, b.lat, b.lon);
    }
    haversine(lat1, lon1, lat2, lon2) {
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
}
exports.DistanceMatrixService = DistanceMatrixService;
//# sourceMappingURL=DistanceMatrixService.js.map