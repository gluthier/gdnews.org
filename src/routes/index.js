const express = require('express');
const database = require('../database');
const router = express.Router();

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
    next();
};

// List posts (Home)
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
        ) as activity_score
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      LEFT JOIN comments c ON p.id = c.post_id
      GROUP BY p.id
      ORDER BY activity_score DESC
      LIMIT ? OFFSET ?
    `, [limit + 1, offset]);

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
// List posts (Newest)
router.get('/new', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/new');
    const limit = 30;
    const offset = (page - 1) * limit;

    try {
        const posts = await database.query(`
      SELECT 
        p.*, 
        u.username, 
        COUNT(c.id) as comment_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      LEFT JOIN comments c ON p.id = c.post_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit + 1, offset]);

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/new?page=${page + 1}`;
        }

        res.render('pages/new', { posts, title: 'newest', nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Show submit form
router.get('/submit', requireLogin, (req, res) => {
    res.render('pages/submit', { error: null, title: 'submit' });
});

// Handle submission
router.post('/submit', requireLogin, async (req, res, next) => {
    const { title, url, text } = req.body;
    if (!title) {
        return res.render('pages/submit', { error: 'Title is required', title: 'submit' });
    }

    try {
        await database.query(
            'INSERT INTO posts (user_id, title, url, content) VALUES (?, ?, ?, ?)',
            [req.session.user.id, title, url || null, text || null]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('pages/submit', { error: 'Submission failed', title: 'submit' });
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
            if (posts.length === 0) {
                const err = new Error('Post not found');
                err.status = 404;
                return next(err);
            }
        }

        const post = posts[0];
        const comments = await database.query(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [postId]);

        // Build comment tree
        const commentMap = {};
        const rootComments = [];

        comments.forEach(comment => {
            comment.children = [];
            commentMap[comment.id] = comment;
        });

        comments.forEach(comment => {
            if (comment.parent_comment_id) {
                if (commentMap[comment.parent_comment_id]) {
                    commentMap[comment.parent_comment_id].children.push(comment);
                }
            } else {
                rootComments.push(comment);
            }
        });

        // Helper to count total descendants
        const countDescendants = (comment) => {
            let count = 0;
            if (comment.children && comment.children.length > 0) {
                count += comment.children.length;
                comment.children.forEach(child => {
                    count += countDescendants(child);
                });
            }
            return count;
        };

        // Attach descendant counts
        comments.forEach(comment => {
            comment.descendant_count = countDescendants(comment);
        });

        res.render('pages/item', { post, comments: rootComments, error: null, title: post.title });
    } catch (err) {
        console.error('Error rendering item page:', err);
        next(err);
    }
});

// Handle comment
router.post('/item/:id/comment', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    const { content, parent_comment_id } = req.body;

    if (!content) {
        return res.redirect(`/item/${postId}`);
    }

    try {
        const result = await database.query(
            'INSERT INTO comments (post_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?)',
            [postId, req.session.user.id, content, parent_comment_id || null]
        );

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            const newComment = {
                id: result.insertId.toString(),
                post_id: postId,
                user_id: req.session.user.id,
                content: content,
                parent_comment_id: parent_comment_id || null,
                created_at: new Date(), // This will be formatted by the helper
                username: req.session.user.username,
                children: [],
                descendant_count: 0,
                depth: 0, // New comments are always at the top level or handled by the parent container logic
                maxDepth: 5 // Default max depth
            };

            // Calculate depth if it's a child comment (optional but good for consistency)
            // For now, we assume the client handles the visual nesting so depth=0 is purely for the partial logic if needed.
            // Actually, the partial logic uses depth to decide whether to show children. 
            // Since it's a new comment, it has no children, so depth doesn't matter much for *its* children.
            // But we should likely try to be accurate if possible, but that requires a DB lookup.
            // For this optimization, passing depth: 0 or similar is fine as the client appends it to the correct parent.

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

        res.redirect(`/item/${postId}`);
    } catch (err) {
        console.error(err);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return next(err);
        }
        res.redirect(`/item/${postId}`);
    }
});

// User profile page
router.get('/user', async (req, res, next) => {
    const username = req.query.id;
    if (!username) {
        if (!username) {
            const err = new Error('User not specified');
            err.status = 404;
            return next(err);
        }
    }

    try {
        const users = await database.query('SELECT id, username, email, created_at FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            if (users.length === 0) {
                const err = new Error('User not found');
                err.status = 404;
                return next(err);
            }
        }
        const user = users[0];

        const page = parseInt(req.query.page) || 1;
        if (page < 1) return res.redirect(`/user?id=${username}`);
        const limit = 30;
        const offset = (page - 1) * limit;

        const posts = await database.query(`
            SELECT p.*, u.username, 
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE u.id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [user.id, limit + 1, offset]);

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/user?id=${username}&page=${page + 1}`;
        }

        res.render('pages/user', { profileUser: user, posts, title: `${user.username}`, nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
