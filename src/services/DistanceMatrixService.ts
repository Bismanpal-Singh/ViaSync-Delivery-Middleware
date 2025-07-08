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
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';

  constructor() {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    }
    this.apiKey = key;
  }

  public async getDistanceMatrix(locations: Location[]): Promise<DistanceMatrixResult | null> {
    try {
      const coordinates = locations.map(loc => `${loc.lat},${loc.lon}`);
      const joinedCoords = coordinates.join('|');

      const response = await axios.get(this.baseUrl, {
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

      const matrix: number[][] = [];
      const distances: number[][] = [];

      response.data.rows.forEach((row: any, i: number) => {
        matrix[i] = [];
        distances[i] = [];

        row.elements.forEach((element: any, j: number) => {
          if (element.status === 'OK') {
            matrix[i][j] = element.duration.value;    // in seconds
            distances[i][j] = element.distance.value; // in meters
          } else {
            const fallback = this.estimateFallbackDistance(locations[i], locations[j]);
            matrix[i][j] = fallback / 10;   // crude estimate: 10 m/s ~ 36 km/h
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

    } catch (error) {
      console.error('Distance Matrix API error:', error);
      return null;
    }
  }

  private estimateFallbackDistance(a: Location, b: Location): number {
    return this.haversine(a.lat, a.lon, b.lat, b.lon);
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(this.toRadians(lat1)) *
              Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
