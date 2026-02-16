const bcrypt = require('bcrypt');
const crypto = require('crypto');

const database = require('../database/database');
const EmailService = require('./email-service');

/**
 * Service to handle user-related operations
 */
const UserService = {
    /**
     * Create a new user
     * @param {Object} userData 
     */
    async createUser({ username, password_hash, email, user_type = 'normal' }) {
        const result = await database.query(
            'INSERT INTO users (username, password_hash, email, email_verified, user_type) VALUES (?, ?, ?, ?, ?)',
            [username, password_hash, email || null, false, user_type]
        );
        
        if (email) {
            await this.initiateEmailConfirmation(result.insertId, email, 'REGISTER');
        }

        return result;
    },

    /**
     * Get a user by username
     * @param {string} username 
     */
    async getUserByUsername(username) {
        const users = await database.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        return users.length > 0 ? users[0] : null;
    },

    /**
     * Get a user by email (case-insensitive)
     * @param {string} email
     */
    async getUserByEmail(email) {
        const users = await database.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
            [email]
        );
        return users.length > 0 ? users[0] : null;
    },

    /**
     * Get a user by ID
     * @param {number} id 
     */
    async getUserById(id) {
        const users = await database.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        return users.length > 0 ? users[0] : null;
    },

    /**
     * Get all users with pagination
     * @param {Object} options
     */
    async getAllUsers({ page = 1, limit = 50 }) {
        const offset = (page - 1) * limit;
        const users = await database.query(
            'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        const countResult = await database.query('SELECT COUNT(*) as count FROM users');
        return {
            users,
            count: Number(countResult[0].count)
        };
    },

    /**
     * Get total user count
     */
    async getUserCount() {
        const countResult = await database.query('SELECT COUNT(*) as count FROM users');
        return Number(countResult[0].count);
    },

    /**
     * Update user email
     * @param {number} userId 
     * @param {string} email 
     */
    async updateUserEmail(userId, email) {
        return await database.query(
            'UPDATE users SET email = ?, email_verified = TRUE WHERE id = ?',
            [email, userId]
        );
    },

    /**
     * Initiate email confirmation (for register or change)
     * @param {number} userId 
     * @param {string} email 
     * @param {string} type 
     */
    async initiateEmailConfirmation(userId, email, type = 'REGISTER') {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await database.query(
            'INSERT INTO email_confirmations (user_id, email, token, type, expires_at) VALUES (?, ?, ?, ?, ?)',
            [userId, email, token, type, expiresAt]
        );

        await EmailService.sendConfirmationEmail(email, token, type);
        return token;
    },

    /**
     * Verify token and complete action
     * @param {string} token 
     */
    async verifyAndComplete(token) {
        const request = await database.query(
            'SELECT * FROM email_confirmations WHERE token = ? AND expires_at > NOW()',
            [token]
        );

        if (request.length === 0) {
            throw new Error('Invalid or expired token');
        }

        const data = request[0];
        
        // Update user
        if (data.type === 'REGISTER') {
             await database.query(
                'UPDATE users SET email_verified = TRUE WHERE id = ?',
                [data.user_id]
            );
        } else if (data.type === 'CHANGE_EMAIL') {
            await database.query(
                'UPDATE users SET email = ?, email_verified = TRUE WHERE id = ?',
                [data.email, data.user_id]
            );
        }

        // Delete used token
        await database.query('DELETE FROM email_confirmations WHERE id = ?', [data.id]);

        return data;
    },

    /**
     * Initiate password reset
     * @param {string} email 
     */
    async initiatePasswordReset(email) {
        const users = await database.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // Don't reveal if email exists, but return early
            return;
        }

        const userId = users[0].id;
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour for reset

        await database.query(
            'INSERT INTO email_confirmations (user_id, email, token, type, expires_at) VALUES (?, ?, ?, ?, ?)',
            [userId, email, token, 'PASSWORD_RESET', expiresAt]
        );

        await EmailService.sendPasswordResetEmail(email, token);
        return token;
    },

    /**
     * Verify password reset token
     * @param {string} token 
     */
    async verifyResetToken(token) {
        const requests = await database.query(
            'SELECT * FROM email_confirmations WHERE token = ? AND type = "PASSWORD_RESET" AND expires_at > NOW()',
            [token]
        );
        return requests.length > 0 ? requests[0] : null;
    },

    /**
     * Reset password
     * @param {string} token 
     * @param {string} newPassword 
     */
    async resetPassword(token, newPassword) {
        const request = await this.verifyResetToken(token);
        if (!request) {
            throw new Error('Invalid or expired reset token');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await database.query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [hashedPassword, request.user_id]
        );

        // Delete used token
        await database.query('DELETE FROM email_confirmations WHERE id = ?', [request.id]);
    },

    /**
     * Ensure bot user exists
     */
    async ensureBotUser() {
        const user = await this.getUserByUsername('gdnews-bot');
        if (!user) {
            console.log("Creating 'gdnews-bot' user...");
            const password = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);
            await this.createUser({
                username: 'gdnews-bot',
                password_hash: hashedPassword,
                email: 'gdnews-bot@gdnews.org',
                user_type: 'bot'
            });
            console.log("'gdnews-bot' user created.");
        }
    },

    /**
     * Ban a user
     * @param {number} userId 
     * @param {string} banType '24hBanned', '7dBanned', 'LifeBanned'
     */
    async banUser(userId, banType) {
        let bannedUntil = null;
        if (banType === '24hBanned') {
            bannedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else if (banType === '7dBanned') {
            bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (banType === 'LifeBanned') {
            // Null banned_until means forever if type is LifeBanned, or we can use a far future date
            // Let's use NULL for indefinite, or a very far date. The logic below handles NULL for LifeBanned implicitly if we just check type.
            // But let's set a far future date just in case or leave null. 
            // Logic: if ban_type != normal, check banned_until. If banned_until is NULL and type is LifeBanned -> banned.
            bannedUntil = null; 
        } else {
             throw new Error('Invalid ban type');
        }

        await database.query(
            'UPDATE users SET ban_type = ?, banned_until = ? WHERE id = ?',
            [banType, bannedUntil, userId]
        );
    },

    /**
     * Check if user is banned and unban if expired. 
     * Fetches fresh user data to ensure accuracy.
     * @param {Object} userSession - User object from session
     * @returns {Object|null} Ban details if banned, null otherwise
     */
    async checkBanStatus(userSession) {
        // Fetch fresh user data
        const user = await this.getUserById(userSession.id);
        
        if (!user || user.ban_type === 'normal') {
            return null;
        }

        if (user.ban_type === 'LifeBanned') {
            return { type: 'LifeBanned', reason: 'Lifetime Ban', until: null };
        }

        if (user.banned_until) {
            const bannedUntil = new Date(user.banned_until);
            if (bannedUntil < new Date()) {
                // Ban expired
                await database.query(
                    'UPDATE users SET ban_type = "normal", banned_until = NULL WHERE id = ?',
                    [user.id]
                );
                return null;
            }
            return { 
                type: user.ban_type, 
                reason: user.ban_type === '24hBanned' ? '24 Hour Ban' : '7 Day Ban',
                until: bannedUntil 
            };
        }

        // Fallback if inconsistent state (banned type but no date and not LifeBanned)
        // Treat as normal or indefinite? Let's treat as indefinite/manual ban if we add more types later.
        // For now, if we are here, it's weird. Return generic ban.
        return { type: user.ban_type, reason: 'Banned', until: null };
    },

    async updateLastConnection(userId) {
        await database.query(
            'UPDATE users SET last_connection = NOW() WHERE id = ?',
            [userId]
        );
    },

    /**
     * Unban a user manually (admin action if needed, though not explicitly requested, good helper)
     */
    async unbanUser(userId) {
         await database.query(
            'UPDATE users SET ban_type = "normal", banned_until = NULL WHERE id = ?',
            [userId]
        );
    }
};

module.exports = UserService;
