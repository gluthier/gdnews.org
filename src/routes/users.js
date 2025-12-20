const express = require('express');
const database = require('../database');
const router = express.Router();

// User profile page
router.get('/user', async (req, res, next) => {
    const username = req.query.id;
    if (!username) {
        const err = new Error('User not specified');
        err.status = 404;
        return next(err);
    }

    try {
        const users = await database.query('SELECT id, username, email, created_at FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            const err = new Error('User not found');
            err.status = 404;
            return next(err);
        }
        const user = users[0];

        const page = parseInt(req.query.page) || 1;
        if (page < 1) return res.redirect(`/user?id=${username}`);
        const limit = 30;
        const offset = (page - 1) * limit;

        const currentTab = req.query.tab || 'submissions';

        if (currentTab === 'favorites') {
            if (!req.session.user || req.session.user.id !== user.id) {
                return res.redirect(`/user?id=${username}`);
            }
        }

        let posts;
        if (currentTab === 'favorites') {
            posts = await database.query(`
                SELECT p.*, u.username, 
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
                FROM favourites f
                JOIN posts p ON f.post_id = p.id
                JOIN users u ON p.user_id = u.id
                WHERE f.user_id = ?
                ORDER BY f.created_at DESC
                LIMIT ? OFFSET ?
            `, [req.session.user ? req.session.user.id : -1, user.id, limit + 1, offset]);
        } else {
            posts = await database.query(`
                SELECT p.*, u.username, 
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
                FROM posts p 
                JOIN users u ON p.user_id = u.id 
                WHERE u.id = ?
                ORDER BY p.created_at DESC
                LIMIT ? OFFSET ?
            `, [req.session.user ? req.session.user.id : -1, user.id, limit + 1, offset]);
        }

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/user?id=${username}&page=${page + 1}&tab=${currentTab}`;
        }

        res.render('pages/user', { profileUser: user, posts, title: `${user.username}`, nextPageUrl, currentTab });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
