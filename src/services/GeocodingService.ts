import axios from 'axios';

interface GeocodingResult {
  lat: number;
  lon: number;
  address: string;
}

export class GeocodingService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor() {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    }
    this.apiKey = key;
  }

  /**
   * Geocode a single address.
   */
  public async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          address,
          key: this.apiKey
        }
      });

      const { status, results } = response.data;

      if (status === 'OK' && results.length > 0) {
        const result = results[0];
        return {
          lat: result.geometry.location.lat,
          lon: result.geometry.location.lng,
          address: result.formatted_address
        };
      }

      console.warn(`Geocoding failed for "${address}": ${status}`);
      return null;

    } catch (error) {
      console.error(`Geocoding error for "${address}":`, error);
      return null;
    }
  }

  /**
   * Geocode multiple addresses in batches.
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
}
