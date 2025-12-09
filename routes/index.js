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
    `);
        res.render('pages/index', { posts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


// List posts (Newest)
router.get('/new', async (req, res) => {
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
    `);
        res.render('pages/new', { posts });
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

        res.render('pages/item', { post, comments: rootComments, error: null });
    } catch (err) {
        console.error('Error rendering item page:', err);
        console.error(err.stack);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Handle comment
router.post('/item/:id/comment', requireLogin, async (req, res) => {
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
            const newCommentId = result.insertId.toString();
            const newComment = {
                id: newCommentId,
                post_id: postId,
                user_id: req.session.user.id,
                content: content,
                parent_comment_id: parent_comment_id || null,
                created_at: new Date(),
                username: req.session.user.username
            };
            return res.json(newComment);
        }

        res.redirect(`/item/${postId}`);
    } catch (err) {
        console.error(err);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ error: 'Server Error' });
        }
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
