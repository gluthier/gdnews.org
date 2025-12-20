const bcrypt = require('bcrypt');
const crypto = require('crypto');

const database = require('../database/database');

/**
 * Service to handle user-related operations
 */
const UserService = {
    /**
     * Create a new user
     * @param {Object} userData 
     */
    async createUser({ username, password_hash, email }) {
        return await database.query(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            [username, password_hash, email || null]
        );
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
            'UPDATE users SET email = ? WHERE id = ?',
            [email, userId]
        );
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
                email: 'gdnews-bot@gdnews.org'
            });
            console.log("'gdnews-bot' user created.");
        }
    }
};

module.exports = UserService;
