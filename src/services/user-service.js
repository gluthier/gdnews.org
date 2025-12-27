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
    }
};

module.exports = UserService;
