const express = require('express');
const database = require('../database');
const router = express.Router();

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// List posts (Home)
router.get('/', async (req, res) => {
    try {
        const posts = await database.query(`
      SELECT p.*, u.username, 
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC
    `);
        res.render('pages/index', { posts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Show submit form
router.get('/submit', requireLogin, (req, res) => {
    res.render('pages/submit', { error: null });
});

// Handle submission
router.post('/submit', requireLogin, async (req, res) => {
    const { title, url, text } = req.body;
    if (!title) {
        return res.render('pages/submit', { error: 'Title is required' });
    }

    try {
        await database.query(
            'INSERT INTO posts (user_id, title, url, content) VALUES (?, ?, ?, ?)',
            [req.session.user.id, title, url || null, text || null]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('pages/submit', { error: 'Submission failed' });
    }
});

// Show post details
router.get('/item/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const posts = await database.query(`
      SELECT p.*, u.username 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `, [postId]);

        if (posts.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = posts[0];
        const comments = await database.query(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [postId]);

        res.render('pages/item', { post, comments, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Handle comment
router.post('/item/:id/comment', requireLogin, async (req, res) => {
    const postId = req.params.id;
    const { content } = req.body;

    if (!content) {
        return res.redirect(`/item/${postId}`);
    }

    try {
        await database.query(
            'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
            [postId, req.session.user.id, content]
        );
        res.redirect(`/item/${postId}`);
    } catch (err) {
        console.error(err);
        res.redirect(`/item/${postId}`);
    }
});

// User profile page
router.get('/user', async (req, res) => {
    const username = req.query.id;
    if (!username) {
        return res.status(404).send('User not specified');
    }

    try {
        const users = await database.query('SELECT id, username, email, created_at FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(404).send('User not found');
        }
        const user = users[0];

        const posts = await database.query(`
            SELECT p.*, u.username, 
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE u.id = ?
            ORDER BY p.created_at DESC
        `, [user.id]);

        res.render('pages/user', { profileUser: user, posts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
