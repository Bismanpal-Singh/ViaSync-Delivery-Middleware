import axios from 'axios';
import { GeocodingCacheService } from './GeocodingCacheService';

interface GeocodingResult {
  lat: number;
  lon: number;
  address: string;
}

export class GeocodingService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
  private cacheService: GeocodingCacheService;

  constructor() {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    }
    this.apiKey = key;
    this.cacheService = new GeocodingCacheService();
  }

  /**
   * Geocode a single address with caching.
   */
  public async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      // Check cache first
      const cached = await this.cacheService.getCachedGeocoding(address);
      if (cached) {
        console.log(`🗺️ Cache hit for: ${address}`);
        return {
          lat: cached.lat,
          lon: cached.lon,
          address: cached.formatted_address
        };
      }

      // If not in cache, call Google API
      console.log(`🗺️ Geocoding: ${address}`);
      const response = await axios.get(this.baseUrl, {
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

        // Cache the result
        await this.cacheService.cacheGeocoding(
          address,
          geocodingResult.lat,
          geocodingResult.lon,
          geocodingResult.address
        );

        return geocodingResult;
      }

      console.warn(`Geocoding failed for "${address}": ${status}`);
      return null;

    } catch (error) {
      console.error(`Geocoding error for "${address}":`, error);
      return null;
    }
  }

  /**
   * Geocode multiple addresses in batches with caching.
   */
  public async geocodeAddresses(addresses: string[]): Promise<Map<string, GeocodingResult>> {
    const results = new Map<string, GeocodingResult>();
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

      // Delay between batches to avoid rate limiting
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get cache statistics.
   */
  public async getCacheStats(): Promise<{ total: number; oldest: string; newest: string }> {
    return await this.cacheService.getCacheStats();
  }

  /**
   * Clear old cache entries.
   */
  public async clearOldCache(daysOld: number = 30): Promise<void> {
    await this.cacheService.clearOldCache(daysOld);
  }

  /**
   * Close the cache service.
   */
  public close(): void {
    this.cacheService.close();
  }
}
