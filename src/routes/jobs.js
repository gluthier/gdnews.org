const express = require('express');
const database = require('../database/database');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const requireLogin = require('../middleware/auth');
const PostService = require('../services/post-service');
const { fetchCommentsForPost } = require('../services/comment-service');

// Jobs Page
router.get('/list', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/job/list');
    const limit = 30;

    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ userId, page, limit, type: 'jobs' });

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/job/list?page=${page + 1}`;
        }

        res.render('pages/job/list', { 
            posts, 
            title: 'jobs', 
            nextPageUrl, 
            basePath: '/job/item/',
            metaDescription: "List of job offers published on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Submit Job Form
router.get('/submit', requireLogin, (req, res) => {
    const formData = req.session.jobFormData || {};
    res.render('pages/job/submit', { 
        ...formData, 
        error: null,
        testOption: "Hi this is a test",
        metaDescription: "Submit a new job offer on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

// Handle Job Submission
router.post('/submit', requireLogin, async (req, res, next) => {
    const { title, description, url } = req.body;

    if (!title || !description) {
        return res.render('pages/job/submit', { 
            error: 'Title and Description are required', 
            title, 
            url, 
            description,
            metaDescription: "Submit a new job offer on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    }

    try {
        await PostService.createPost({
            userId: req.session.user.id,
            title,
            url,
            description: description,
            isJob: true
        });
        delete req.session.jobFormData;
        res.redirect('/job/list');
    } catch (err) {
        console.error(err);
        req.session.jobFormData = { title, url, description };
        res.render('pages/job/submit', { 
            error: err.message || 'Submission failed', 
            title, 
            url, 
            description,
            metaDescription: "Submit a new job offer on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    }
});

// Show job details
router.get('/item/:id', async (req, res, next) => {
    const jobId = req.params.id;
    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const post = await PostService.getPostById(jobId, userId);

        if (!post || !post.is_job) {
            const err = new Error('Job not found');
            err.status = 404;
            return next(err);
        }

        const comments = await fetchCommentsForPost(jobId);

        res.render('pages/job/item', { 
            job: post, 
            basePath: '/job/item/',
            title: post.title, 
            comments,
            isFavorited: !!post.isFavorited,
            metaDescription: `Job offer from gdnews: ${post.title}`
        });
    } catch (err) {
        console.error('Error rendering job page:', err);
        next(err);
    }
});

// Job Removal Selection Page
router.get('/item/:id/remove', requireLogin, async (req, res, next) => {
    const jobId = req.params.id;
    try {
        const post = await PostService.getPostById(jobId, req.session.user.id);

        if (!post || !post.is_job) {
            const err = new Error('Job not found');
            err.status = 404;
            return next(err);
        }

        if (post.user_id !== req.session.user.id) {
            const err = new Error('Unauthorized');
            err.status = 403;
            return next(err);
        }

        res.render('pages/job/remove', { job: post, title: 'Remove Offer' });
    } catch (err) {
        next(err);
    }
});

// Handle Unsuccessful Offer removal
router.post('/item/:id/remove/unsuccessful', requireLogin, async (req, res, next) => {
    const jobId = req.params.id;
    try {
        const post = await PostService.getPostById(jobId, req.session.user.id);

        if (!post || post.user_id !== req.session.user.id) {
            return res.status(403).send('Unauthorized');
        }

        await PostService.updatePostStatus(jobId, 'removed');
        res.redirect('/job/list');
    } catch (err) {
        next(err);
    }
});

// Handle Successful Hire removal (Stripe)
router.post('/item/:id/remove/successful', requireLogin, async (req, res, next) => {
    return res.render('pages/job/remove', { 
        job: post,
        title: 'Remove Offer',
        error: 'This feature is not available yet.'
    });

    const jobId = req.params.id;
    try {
        const post = await PostService.getPostById(jobId, req.session.user.id);

        if (!post || post.user_id !== req.session.user.id) {
            return res.status(403).send('Unauthorized');
        }

        const domain = `${req.protocol}://${req.get('host')}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: req.session.user.email,
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: 'Successful Hire Fee',
                            description: `Fee for successful hire on GDNews for: ${post.title}`,
                        },
                        unit_amount: 10000, // €100.00
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${domain}/job/remove/success?session_id={CHECKOUT_SESSION_ID}&job_id=${jobId}`,
            cancel_url: `${domain}/job/remove/cancel?job_id=${jobId}`,
            metadata: {
                user_id: req.session.user.id,
                job_id: jobId,
                type: 'successful_hire'
            }
        });

        res.redirect(303, session.url);
    } catch (err) {
        next(err);
    }
});

// Stripe Success Callback
router.get('/remove/success', requireLogin, async (req, res, next) => {
    const { session_id, job_id } = req.query;

    if (!session_id || !job_id) {
        return res.redirect('/job/list');
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            await PostService.updatePostStatus(job_id, 'filled');
            res.redirect(`/job/item/${job_id}?success=true`);
        } else {
            res.redirect(`/job/item/${job_id}/remove?error=payment_failed`);
        }
    } catch (err) {
        next(err);
    }
});

// Stripe Cancel Callback
router.get('/remove/cancel', requireLogin, (req, res) => {
    const { job_id } = req.query;
    res.redirect(`/job/item/${job_id}/remove?error=cancelled`);
});

module.exports = router;
