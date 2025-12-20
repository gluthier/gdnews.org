const express = require('express');
const database = require('../database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const requireLogin = require('../middleware/auth');
const { fetchCommentsForPost } = require('../services/comment-service');

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
             return res.render('pages/schedule-promoted', { 
                error: 'Slot was taken during payment. Please contact support for refund.',
                minDate: new Date().toISOString().split('T')[0]
             });
        }

        await database.query(
            'INSERT INTO posts (user_id, title, url, content, is_promoted, promoted_date) VALUES (?, ?, ?, ?, TRUE, ?)',
            [user_id, title, url || null, text || null, promoted_date]
        );

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

module.exports = router;
