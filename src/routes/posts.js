const express = require('express');
const database = require('../database');
const router = express.Router();
const requireLogin = require('../middleware/auth');
const { fetchCommentsForPost } = require('../services/comment-service');

// List posts (Home)
router.get('/', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/');
    const limit = 30;
    const offset = (page - 1) * limit;

    try {
        const posts = await database.query(`
      SELECT 
        p.*, 
        u.username, 
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
      GROUP BY p.id
      ORDER BY activity_score DESC
      LIMIT ? OFFSET ?
    `, [req.session.user ? req.session.user.id : -1, limit + 1, offset]);

        // If we are on the first page, fetch and inject today's promoted post
        if (page === 1) {
            const promoted = await database.query(`
                SELECT 
                    p.*, 
                    u.username, 
                    COUNT(c.id) as comment_count,
                    EXISTS(SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = ?) as isFavorited
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN comments c ON p.id = c.post_id
                WHERE p.is_promoted = TRUE AND p.promoted_date = CURRENT_DATE()
                GROUP BY p.id
                LIMIT 1
            `, [req.session.user ? req.session.user.id : -1]);

            if (promoted.length > 0) {
                posts.unshift(promoted[0]);
            }
        }

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop(); // Remove the extra item
            nextPageUrl = `/?page=${page + 1}`;
        }

        res.render('pages/index', { posts, nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// List posts (Newest)
router.get('/newest', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/newest');
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
      WHERE NOT (p.is_promoted = TRUE AND p.promoted_date > CURRENT_DATE())
      GROUP BY p.id
      ORDER BY 
        CASE 
          WHEN p.is_promoted = TRUE THEN p.promoted_date 
          ELSE p.created_at 
        END DESC
      LIMIT ? OFFSET ?
    `, [req.session.user ? req.session.user.id : -1, limit + 1, offset]);

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/newest?page=${page + 1}`;
        }

        res.render('pages/newest', { posts, title: 'newest', nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Show submit form
router.get('/submit', requireLogin, (req, res) => {
    res.render('pages/submit-post', { error: null });
});

// Handle submission
router.post('/submit', requireLogin, async (req, res, next) => {
    const { title, url, text } = req.body;
    if (!title) {
        return res.render('pages/submit-post', { error: 'Title is required' });
    }

    if (url && (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('data:'))) {
        return res.render('pages/submit-post', { error: 'Invalid URL scheme' });
    }

    try {
        await database.query(
            'INSERT INTO posts (user_id, title, url, content) VALUES (?, ?, ?, ?)',
            [req.session.user.id, title, url || null, text || null]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('pages/submit-post', { error: 'Submission failed' });
    }
});

// Show post details
router.get('/item/:id', async (req, res, next) => {
    const postId = req.params.id;
    try {
        const posts = await database.query(`
      SELECT p.*, u.username 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `, [postId]);

        if (posts.length === 0) {
            const err = new Error('Post not found');
            err.status = 404;
            return next(err);
        }

        const post = posts[0];
        const rootComments = await fetchCommentsForPost(postId);

        let isFavorited = false;
        if (req.session.user) {
            const favCheck = await database.query(
                'SELECT 1 FROM favourites WHERE user_id = ? AND post_id = ?',
                [req.session.user.id, postId]
            );
            if (favCheck.length > 0) {
                isFavorited = true;
            }
        }

        res.render('pages/post-item-page', { post, comments: rootComments, error: null, title: post.title, isFavorited });
    } catch (err) {
        console.error('Error rendering item page:', err);
        next(err);
    }
});

// Handle comment
router.post('/item/:id/comment', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    const { content, parent_comment_id } = req.body;

    const redirectUrl = req.get('Referrer') || `/item/${postId}`;

    if (!content) {
        return res.redirect(redirectUrl);
    }

    try {
        const result = await database.query(
            'INSERT INTO comments (post_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?)',
            [postId, req.session.user.id, content, parent_comment_id || null]
        );

        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            const newComment = {
                id: result.insertId.toString(),
                post_id: postId,
                user_id: req.session.user.id,
                content: content,
                parent_comment_id: parent_comment_id || null,
                created_at: new Date(),
                username: req.session.user.username,
                children: [],
                descendant_count: 0,
                depth: 0,
                maxDepth: 5
            };

            res.render('partials/comment', {
                layout: false,
                ...newComment
            }, (err, html) => {
                if (err) {
                    console.error('Render error:', err);
                    return res.status(500).json({ error: 'Render Error' });
                }
                res.send(html);
            });
            return;
        }

        res.redirect(redirectUrl);
    } catch (err) {
        console.error(err);
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return next(err);
        }
        res.redirect(redirectUrl);
    }
});

router.post('/favorite/:id', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    try {
        await database.query(
            'INSERT IGNORE INTO favourites (user_id, post_id) VALUES (?, ?)',
            [req.session.user.id, postId]
        );
        res.redirect(req.get('Referrer') || `/item/${postId}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});

router.post('/unfavorite/:id', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    try {
        await database.query(
            'DELETE FROM favourites WHERE user_id = ? AND post_id = ?',
            [req.session.user.id, postId]
        );
        res.redirect(req.get('Referrer') || `/item/${postId}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
