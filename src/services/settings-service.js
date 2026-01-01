const pool = require('../database/database');

class SettingsService {
    constructor() {
        this.cache = {
            lock_signup: false,
            lock_posts: false,
            lock_comments: false,
            lock_global: false
        };
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        try {
            const rows = await pool.query('SELECT setting_key, setting_value FROM system_settings');
            rows.forEach(row => {
                if (this.cache.hasOwnProperty(row.setting_key)) {
                    // Store as boolean
                    this.cache[row.setting_key] = row.setting_value === 'true';
                }
            });
            this.initialized = true;
        } catch (err) {
            console.error('Failed to initialize SettingsService:', err);
        }
    }

    get(key) {
        if (!this.initialized) {
            console.warn('SettingsService accessed before initialization');
        }
        return this.cache[key];
    }

    // Helper to check if an action is locked (considering global lock)
    isLocked(action) {
        if (this.cache.lock_global) return true;
        return this.cache[action] === true;
    }

    async set(key, value) {
        // value should be boolean
        const strValue = value ? 'true' : 'false';
        
        // Update cache
        this.cache[key] = value;

        // Update DB
        try {
            // Upsert
            await pool.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                [key, strValue, strValue]
            );
            return true;
        } catch (err) {
            console.error(`Failed to save setting ${key}:`, err);
            return false;
        }
    }

    async getAll() {
        if (!this.initialized) await this.init();
        return { ...this.cache };
    }
}

const settingsService = new SettingsService();
module.exports = settingsService;
