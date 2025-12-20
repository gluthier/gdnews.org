const express = require('express');
const database = require('../database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
    next();
};

// Helper to fetch comments and build tree
const fetchCommentsForPost = async (postId) => {
    constcomments = await database.query(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [postId]);

    // Build comment tree
    const commentMap = {};
    const rootComments = [];

    const comments = await database.query(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [postId]);

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

    return rootComments;
};



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
            if (posts.length === 0) {
                const err = new Error('Post not found');
                err.status = 404;
                return next(err);
            }
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

    // Determine redirect URL (fallback to item page if referrer is missing)
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
                created_at: new Date(), // This will be formatted by the helper
                username: req.session.user.username,
                children: [],
                descendant_count: 0,
                depth: 0, // New comments are always at the top level or handled by the parent container logic
                maxDepth: 5 // Default max depth
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

// Upcoming Promoted Posts
router.get('/upcoming', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/upcoming');
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
            WHERE p.is_promoted = TRUE AND p.promoted_date > CURRENT_DATE()
            GROUP BY p.id
            ORDER BY p.promoted_date ASC
            LIMIT ? OFFSET ?
        `, [req.session.user ? req.session.user.id : -1, limit + 1, offset]);

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/upcoming?page=${page + 1}`;
        }

        res.render('pages/upcoming', { posts, title: 'upcoming', nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Buy Promoted Post Form
router.get('/schedule-promoted', requireLogin, (req, res) => {
    res.render('pages/schedule-promoted', { error: null, minDate: new Date().toISOString().split('T')[0] });
});

// Process Promoted Post Purchase
router.post('/schedule-promoted', requireLogin, async (req, res, next) => {
    const { title, url, text, promoted_date, pricing_tier } = req.body;
    
    // Simple validation for pricing tier
    const validTiers = ['personal', 'indie', 'mid', 'aaa'];
    const tierPrices = {
        'personal': 20,
        'indie': 100,
        'mid': 1000,
        'aaa': 2000
    };

    if (!title || !promoted_date || !pricing_tier || !validTiers.includes(pricing_tier)) {
        return res.render('pages/schedule-promoted', { 
            error: 'Title, Date, and a valid Pricing Tier are required',
            title: title,
            url: url,
            text: text,
            minDate: new Date().toISOString().split('T')[0]
        });
    }

    const selectedDate = new Date(promoted_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate <= today) {
         return res.render('pages/schedule-promoted', { 
            error: 'Date must be in the future', 
            title: title,
            url: url,
            text: text,
            minDate: new Date().toISOString().split('T')[0]
        });
    }

    try {
        // Check for collision
        const existing = await database.query(
            'SELECT id FROM posts WHERE is_promoted = TRUE AND promoted_date = ?',
            [promoted_date]
        );

        if (existing.length > 0) {
            return res.render('pages/schedule-promoted', { 
                error: 'A promoted post is already scheduled for this date. Please choose another day.', 
                title: title,
                url: url,
                text: text,
                minDate: new Date().toISOString().split('T')[0]
            });
        }

        const domain = `${req.protocol}://${req.get('host')}`;

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `Promoted Post (${pricing_tier})`,
                            description: `Promoted post for ${promoted_date}`,
                        },
                        unit_amount: tierPrices[pricing_tier],
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${domain}/promoted-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${domain}/promoted-cancel`,
            metadata: {
                user_id: req.session.user.id,
                title: title,
                url: url || '',
                text: text || '',
                promoted_date: promoted_date,
                pricing_tier: pricing_tier
            }
        });

        res.redirect(303, session.url);

    } catch (err) {
        console.error(err);
        res.render('pages/schedule-promoted', { 
            error: 'Transaction failed: ' + err.message, 
            title: title,
            url: url,
            text: text,
            minDate: new Date().toISOString().split('T')[0]
        });
    }
});

router.get('/promoted-success', requireLogin, async (req, res, next) => {
    const sessionId = req.query.session_id;

    if (!sessionId) {
        return res.redirect('/schedule-promoted');
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Verify that the payment was successful
        if (session.payment_status !== 'paid') {
             return res.render('pages/schedule-promoted', { 
                error: 'Payment was not successful.',
                minDate: new Date().toISOString().split('T')[0]
             });
        }

        const { user_id, title, url, text, promoted_date, pricing_tier } = session.metadata;

        // Double check collision just in case (race condition)
         const existing = await database.query(
            'SELECT id FROM posts WHERE is_promoted = TRUE AND promoted_date = ?',
            [promoted_date]
        );

        if (existing.length > 0) {
            // Edge case: someone else took the spot while payment was happening
            // In a real app we might refund or allow rescheduling. 
            // For now, we error.
             return res.render('pages/schedule-promoted', { 
                error: 'Slot was taken during payment. Please contact support for refund.',
                minDate: new Date().toISOString().split('T')[0]
             });
        }

        await database.query(
            'INSERT INTO posts (user_id, title, url, content, is_promoted, promoted_date) VALUES (?, ?, ?, ?, TRUE, ?)',
            [user_id, title, url || null, text || null, promoted_date]
        );

        // We could render a specific success page, but redirecting to upcoming is standard flow
        // passing a query param for a toast would be nice, but simple redirect is fine per plan.
        res.redirect('/upcoming');

    } catch (err) {
        console.error(err);
        res.render('pages/error', { message: 'Error verifying payment', statusCode: 500, title: 'Error' });
    }
});

router.get('/promoted-cancel', requireLogin, (req, res) => {
    res.render('pages/schedule-promoted', { 
        error: 'Payment cancelled.',
        minDate: new Date().toISOString().split('T')[0]
    });
});

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

// Show promoted post details
router.get('/promoted/:id', async (req, res, next) => {
    const promotedId = req.params.id;
    try {
        const posts = await database.query(`
            SELECT p.*, u.username 
            FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ? AND p.is_promoted = TRUE
        `, [promotedId]);

        if (posts.length === 0) {
            const err = new Error('Promoted post not found');
            err.status = 404;
            return next(err);
        }

        const comments = await fetchCommentsForPost(promotedId);

        res.render('pages/promoted', { post: posts[0], title: posts[0].title, comments });
    } catch (err) {
        console.error('Error rendering promoted post page:', err);
        next(err);
    }
});

// Static pages
router.get('/about', (req, res) => {
    res.render('pages/about', { title: 'About' });
});

router.get('/guidelines', (req, res) => {
    res.render('pages/guidelines', { title: 'Guidelines' });
});

router.get('/legal', (req, res) => {
    res.render('pages/legal', { title: 'Legal' });
});




module.exports = router;
