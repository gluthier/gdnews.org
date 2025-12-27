const database = require('../database/database');

/**
 * Service to handle post-related operations
 */
const PostService = {
    /**
     * Get posts based on various filters
     * @param {Object} options
     * @param {number} [options.userId] - ID of the logged in user (for favorites check)
     * @param {number} [options.page=1] - Page number
     * @param {number} [options.limit=30] - Number of items per page
     * @param {string} [options.type='home'] - Type of listing ('home', 'newest', 'jobs', 'upcoming', 'user_submissions', 'user_favorites')
     * @param {string|number} [options.targetId] - Target ID for user submissions/favorites (username or user ID)
     */
    async getPosts({ userId = -1, page = 1, limit = 30, type = 'home', targetId = null }) {
        const offset = (page - 1) * limit;
        let query = '';
        let params = [userId];

        // Base SELECT and JOINs
        const selectPart = `
            SELECT 
                p.*, 
                u.username, 
                u.user_type,
                COUNT(c.id) as comment_count,
                EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
        `;
        const fromPart = `
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            LEFT JOIN comments c ON p.id = c.post_id
        `;
        const groupByPart = ` GROUP BY p.id `;

        switch (type) {
            case 'newest':
                query = `
                    ${selectPart}
                    ${fromPart}
                    WHERE NOT (p.is_promoted = TRUE AND p.promoted_date > CURRENT_DATE())
                    AND p.status = 'active'
                    ${groupByPart}
                    ORDER BY 
                        CASE 
                          WHEN p.is_promoted = TRUE THEN p.promoted_date 
                          ELSE p.created_at 
                        END DESC
                    LIMIT ? OFFSET ?
                `;
                params.push(limit + 1, offset);
                break;

            case 'jobs':
                query = `
                    ${selectPart}
                    ${fromPart}
                    WHERE p.is_job = TRUE AND p.status = 'active'
                    ${groupByPart}
                    ORDER BY p.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                params.push(limit + 1, offset);
                break;

            case 'upcoming':
                query = `
                    ${selectPart}
                    ${fromPart}
                    WHERE p.is_promoted = TRUE AND p.promoted_date > CURRENT_DATE()
                    AND p.status != 'removed'
                    ${groupByPart}
                    ORDER BY p.promoted_date ASC
                    LIMIT ? OFFSET ?
                `;
                params.push(limit + 1, offset);
                break;

            case 'user_submissions':
                query = `
                    ${selectPart}
                    ${fromPart}
                    WHERE u.username = ?
                    AND p.status != 'removed'
                    ${groupByPart}
                    ORDER BY 
                        CASE 
                            WHEN p.is_promoted = TRUE THEN p.promoted_date 
                            ELSE p.created_at 
                        END DESC
                    LIMIT ? OFFSET ?
                `;
                params.push(targetId, limit + 1, offset);
                break;

            case 'user_favorites':
                query = `
                    SELECT 
                        p.*, 
                        u.username, 
                        u.user_type,
                        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                        TRUE as isFavorited
                    FROM favourites f
                    JOIN posts p ON f.post_id = p.id
                    JOIN users u ON p.user_id = u.id
                    JOIN users target_u ON f.user_id = target_u.id
                    WHERE target_u.username = ?
                    AND p.status != 'removed'
                    ORDER BY f.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                // userId is not needed for target_u check if we already have the username
                // but params still expects something for the first ? if we used selectPart
                // So we redefine query here to be more efficient
                params = [targetId, limit + 1, offset]; 
                break;

            case 'home':
            default:
                // Home uses activity score
                query = `
                    SELECT 
                        p.*, 
                        u.username, 
                        u.user_type,
                        COUNT(c.id) as comment_count,
                        (
                          100 / POW(TIMESTAMPDIFF(HOUR, p.created_at, NOW()) + 2, 1.8) + 
                          COALESCE(SUM(10 / POW(TIMESTAMPDIFF(HOUR, c.created_at, NOW()) + 2, 1.8)), 0)
                        ) as activity_score,
                        EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
                    FROM posts p 
                    JOIN users u ON p.user_id = u.id 
                    LEFT JOIN comments c ON p.id = c.post_id
                    WHERE NOT (p.is_promoted = TRUE AND p.promoted_date >= CURRENT_DATE())
                    AND p.status = 'active'
                    GROUP BY p.id
                    ORDER BY activity_score DESC
                    LIMIT ? OFFSET ?
                `;
                params.push(limit + 1, offset);
                break;
        }

        const posts = await database.query(query, params);

        if (type === 'home' && page === 1) {
            const promoted = await database.query(`
                SELECT 
                    p.*, 
                    u.username, 
                    u.user_type,
                    COUNT(c.id) as comment_count,
                    EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN comments c ON p.id = c.post_id
                WHERE p.is_promoted = TRUE AND p.promoted_date = CURRENT_DATE()
                GROUP BY p.id
                LIMIT 1
            `, [userId]);

            if (promoted.length > 0) {
                posts.unshift(promoted[0]);
            }
        }

        return posts;
    },

    /**
     * Get a single post by ID
     * @param {number} id 
     * @param {number} userId 
     */
    async getPostById(id, userId = -1) {
        const posts = await database.query(`
            SELECT p.*, u.username, u.user_type,
            EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ?
            AND p.status != 'removed'
        `, [userId, id]);

        return posts.length > 0 ? posts[0] : null;
    },

    /**
     * Create a new post
     */
    async createPost({ userId, title, url, description, isJob = false, isPromoted = false, promotedDate = null }) {
        if (title.length > 180) {
            throw new Error('Title must be 180 characters or less');
        }

        await this.checkSubmissionLimit(userId, isJob);

        return await database.query(
            'INSERT INTO posts (user_id, title, url, description, is_job, is_promoted, promoted_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, title, url || null, description || null, isJob, isPromoted, promotedDate]
        );
    },

    /**
     * Count submissions for a user today
     * @param {number} userId
     * @param {boolean} isJob
     */
    async countSubmissionsToday(userId, isJob) {
        const result = await database.query(
            "SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND is_job = ? AND created_at >= CURDATE() AND status != 'removed'",
            [userId, isJob]
        );
        return result[0].count;
    },

    /**
     * Check if a user has reached their submission limit
     * @param {number} userId
     * @param {boolean} isJob
     */
    async checkSubmissionLimit(userId, isJob) {
        const users = await database.query('SELECT email_verified FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            throw new Error('User not found');
        }

        const isVerified = !!users[0].email_verified;
        const limit = isVerified ? 10 : 5;
        const count = await this.countSubmissionsToday(userId, isJob);

        if (count >= limit) {
            const type = isJob ? 'jobs' : 'posts';
            const verificationStatus = isVerified ? 'validated' : 'not validated';
            throw new Error(`Daily limit reached. You can submit up to ${limit} ${type} per day because your email is ${verificationStatus}.`);
        }
    },

    /**
     * Add a comment to a post
     */
    async addComment({ postId, userId, content, parentCommentId = null }) {
        return await database.query(
            'INSERT INTO comments (post_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?)',
            [postId, userId, content, parentCommentId]
        );
    },

    /**
     * Favorite a post
     */
    async favorite(userId, postId) {
        return await database.query(
            'INSERT IGNORE INTO favourites (user_id, post_id) VALUES (?, ?)',
            [userId, postId]
        );
    },

    /**
     * Unfavorite a post
     */
    async unfavorite(userId, postId) {
        return await database.query(
            'DELETE FROM favourites WHERE user_id = ? AND post_id = ?',
            [userId, postId]
        );
    },

    /**
     * Check if a promoted post exists for a given date
     * @param {string} promotedDate 
     */
    async checkPromotedCollision(promotedDate) {
        const existing = await database.query(
            "SELECT id FROM posts WHERE is_promoted = TRUE AND promoted_date = ? AND status != 'removed'",
            [promotedDate]
        );
        return existing.length > 0;
    },

    /**
     * Get unique links from the last 7 days
     */
    async getWeeklyLinks() {
        const query = `
            SELECT title, url 
            FROM posts 
            WHERE url IS NOT NULL 
              AND url != '' 
              AND status != 'removed'
              AND created_at >= NOW() - INTERVAL 7 DAY 
            ORDER BY 
                CASE 
                    WHEN is_promoted = TRUE THEN promoted_date 
                    ELSE created_at 
                END DESC
        `;
        return await database.query(query);
    },

    /**
     * Update a post's status
     * @param {number} id
     * @param {string} status
     */
    async updatePostStatus(id, status) {
        return await database.query(
            'UPDATE posts SET status = ? WHERE id = ?',
            [status, id]
        );
    }
};

module.exports = PostService;
