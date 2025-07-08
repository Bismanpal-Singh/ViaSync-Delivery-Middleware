import sqlite3 from 'sqlite3';
import path from 'path';

interface GeocodingCache {
  address: string;
  lat: number;
  lon: number;
  formatted_address: string;
  created_at: string;
}

export class GeocodingCacheService {
  private db!: sqlite3.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(__dirname, '../../data/geocoding_cache.db');
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening geocoding cache database:', err);
      } else {
        console.log('✅ Geocoding cache database connected');
        this.createTable();
      }
    });
  }

  private createTable(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        address TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        formatted_address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(sql, (err) => {
      if (err) {
        console.error('❌ Error creating geocoding cache table:', err);
      } else {
        console.log('✅ Geocoding cache table ready');
      }
    });
  }

  async getCachedGeocoding(address: string): Promise<GeocodingCache | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM geocoding_cache WHERE address = ?';
      this.db.get(sql, [address], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as GeocodingCache || null);
        }
      });
    });
  }

  async cacheGeocoding(address: string, lat: number, lon: number, formattedAddress: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO geocoding_cache (address, lat, lon, formatted_address, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      this.db.run(sql, [address, lat, lon, formattedAddress], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async clearOldCache(daysOld: number = 30): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM geocoding_cache WHERE created_at < datetime("now", "-" || ? || " days")';
      this.db.run(sql, [daysOld], (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🧹 Cleared geocoding cache older than ${daysOld} days`);
          resolve();
        }
      });
    });
  }

  async getCacheStats(): Promise<{ total: number; oldest: string; newest: string }> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM geocoding_cache
      `;
      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as { total: number; oldest: string; newest: string });
        }
      });
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('❌ Error closing geocoding cache database:', err);
      } else {
        console.log('✅ Geocoding cache database closed');
      }
    });
  }
} 