import axios from 'axios';

interface Location {
  lat: number;
  lon: number;
  type: 'depot' | 'order';
  orderId?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

interface DistanceMatrixResult {
  origins: string[];
  destinations: string[];
  matrix: number[][];    // Travel times in seconds
  distances: number[][]; // Distances in meters
}

export class DistanceMatrixService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

  constructor() {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    }
    this.apiKey = key;
  }

  public async getDistanceMatrix(locations: Location[]): Promise<DistanceMatrixResult | null> {
    try {
      if (locations.length > 25) {
        throw new Error('Compute Route Matrix API supports up to 25 locations per request (non-traffic-aware).');
      }
      const origins = locations.map(loc => ({
        waypoint: { location: { latLng: { latitude: loc.lat, longitude: loc.lon } } }
      }));
      const destinations = origins; // Full matrix
      const coordinates = locations.map(loc => `${loc.lat},${loc.lon}`);

      const body = {
        origins,
        destinations,
        travelMode: 'DRIVE'
      };

      const response = await axios.post(
        this.baseUrl,
        body,
        {
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status,condition',
            'Content-Type': 'application/json'
        }
        }
      );

      // Log API response only in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Compute Route Matrix API response received');
      }

      // Reconstruct the NxN matrix from the flat response
      const N = locations.length;
      const matrix: number[][] = Array(N).fill(null).map(() => Array(N).fill(null));
      const distances: number[][] = Array(N).fill(null).map(() => Array(N).fill(null));

      for (const element of response.data) {
        const i = element.originIndex;
        const j = element.destinationIndex;
        let durationSeconds = 999999;
        if (typeof element.duration === 'string' && element.duration.endsWith('s')) {
          durationSeconds = parseInt(element.duration.replace('s', ''), 10);
        }
        matrix[i][j] = durationSeconds;
        distances[i][j] = typeof element.distanceMeters === 'number' ? element.distanceMeters : 999999;
          }

      return {
        origins: coordinates,
        destinations: coordinates,
        matrix,
        distances
      };
    } catch (error) {
      console.error('Compute Route Matrix API error:', error);
      return null;
    }
  }
}
