const express = require('express');
const database = require('../database');
const router = express.Router();
const requireLogin = require('../middleware/auth');
const { fetchCommentsForPost } = require('../services/comment-service');

// Jobs Page
router.get('/jobs', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/jobs');
    const limit = 30;
    const offset = (page - 1) * limit;

    try {
        const posts = await database.query(`
            SELECT 
                p.*, 
                u.username,
                COUNT(c.id) as comment_count,
                EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
            FROM posts p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN comments c ON p.id = c.post_id
            WHERE p.is_job = TRUE
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [req.session.user ? req.session.user.id : -1, limit + 1, offset]);

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/jobs?page=${page + 1}`;
        }

        res.render('pages/jobs', { posts, title: 'jobs', nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Submit Job Form
router.get('/submit-job', requireLogin, (req, res) => {
    res.render('pages/submit-job', { error: null });
});

// Handle Job Submission
router.post('/submit-job', requireLogin, async (req, res, next) => {
    const { title, text, url } = req.body;

    if (!title || !text) {
        return res.render('pages/submit-job', { 
            error: 'Title and Description are required', 
            title, 
            url, 
            text,
        });
    }

    try {
        await database.query(
            'INSERT INTO posts (user_id, title, url, content, is_job) VALUES (?, ?, ?, ?, TRUE)',
            [req.session.user.id, title, url || null, text]
        );
        res.redirect('/jobs');
    } catch (err) {
        console.error(err);
        res.render('pages/submit-job', { 
            error: 'Submission failed', 
            title, 
            url, 
            text 
        });
    }
});

// Show job details
router.get('/job/:id', async (req, res, next) => {
    const jobId = req.params.id;
    try {
        const posts = await database.query(`
            SELECT p.*, u.username 
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ? AND p.is_job = TRUE
        `, [jobId]);

        if (posts.length === 0) {
            const err = new Error('Job not found');
            err.status = 404;
            return next(err);
        }

        const comments = await fetchCommentsForPost(jobId);

        res.render('pages/job', { job: posts[0], title: posts[0].title, comments });
    } catch (err) {
        console.error('Error rendering job page:', err);
        next(err);
    }
});

module.exports = router;
