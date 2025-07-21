"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingCacheService = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
class GeocodingCacheService {
    constructor() {
        this.dbPath = path_1.default.join(__dirname, '../../data/geocoding_cache.db');
        this.initDatabase();
    }
    initDatabase() {
        this.db = new sqlite3_1.default.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Error opening geocoding cache database:', err);
            }
            else {
                console.log('✅ Geocoding cache database connected');
                this.createTable();
            }
        });
    }
    createTable() {
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
            }
            else {
                console.log('✅ Geocoding cache table ready');
            }
        });
    }
    async getCachedGeocoding(address) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM geocoding_cache WHERE address = ?';
            this.db.get(sql, [address], (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row || null);
                }
            });
        });
    }
    async cacheGeocoding(address, lat, lon, formattedAddress) {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT OR REPLACE INTO geocoding_cache (address, lat, lon, formatted_address, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
            this.db.run(sql, [address, lat, lon, formattedAddress], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async clearOldCache(daysOld = 30) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM geocoding_cache WHERE created_at < datetime("now", "-" || ? || " days")';
            this.db.run(sql, [daysOld], (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log(`🧹 Cleared geocoding cache older than ${daysOld} days`);
                    resolve();
                }
            });
        });
    }
    async getCacheStats() {
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
                }
                else {
                    resolve(row);
                }
            });
        });
    }
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('❌ Error closing geocoding cache database:', err);
            }
            else {
                console.log('✅ Geocoding cache database closed');
            }
        });
    }
}
exports.GeocodingCacheService = GeocodingCacheService;
//# sourceMappingURL=GeocodingCacheService.js.map