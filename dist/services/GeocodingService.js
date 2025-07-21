"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
const axios_1 = __importDefault(require("axios"));
const GeocodingCacheService_1 = require("./GeocodingCacheService");
class GeocodingService {
    constructor() {
        this.baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key) {
            throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
        this.cacheService = new GeocodingCacheService_1.GeocodingCacheService();
    }
    async geocodeAddress(address) {
        try {
            const cached = await this.cacheService.getCachedGeocoding(address);
            if (cached) {
                console.log(`🗺️ Cache hit for: ${address}`);
                return {
                    lat: cached.lat,
                    lon: cached.lon,
                    address: cached.formatted_address
                };
            }
            console.log(`🗺️ Geocoding: ${address}`);
            const response = await axios_1.default.get(this.baseUrl, {
                params: {
                    address,
                    key: this.apiKey
                }
            });
            const { status, results } = response.data;
            if (status === 'OK' && results.length > 0) {
                const result = results[0];
                const geocodingResult = {
                    lat: result.geometry.location.lat,
                    lon: result.geometry.location.lng,
                    address: result.formatted_address
                };
                await this.cacheService.cacheGeocoding(address, geocodingResult.lat, geocodingResult.lon, geocodingResult.address);
                return geocodingResult;
            }
            console.warn(`Geocoding failed for "${address}": ${status}`);
            return null;
        }
        catch (error) {
            console.error(`Geocoding error for "${address}":`, error);
            return null;
        }
    }
    async geocodeAddresses(addresses) {
        const results = new Map();
        const batchSize = 10;
        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            const promises = batch.map(async (address) => {
                const result = await this.geocodeAddress(address);
                return { address, result };
            });
            const batchResults = await Promise.all(promises);
            batchResults.forEach(({ address, result }) => {
                if (result) {
                    results.set(address, result);
                }
            });
            if (i + batchSize < addresses.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }
    async getCacheStats() {
        return await this.cacheService.getCacheStats();
    }
    async clearOldCache(daysOld = 30) {
        await this.cacheService.clearOldCache(daysOld);
    }
    close() {
        this.cacheService.close();
    }
}
exports.GeocodingService = GeocodingService;
//# sourceMappingURL=GeocodingService.js.map