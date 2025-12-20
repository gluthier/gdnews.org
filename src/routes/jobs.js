const express = require('express');
const database = require('../database/database');
const router = express.Router();

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

        res.render('pages/job/list', { posts, title: 'jobs', nextPageUrl, basePath: '/job/item/' });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Submit Job Form
router.get('/submit', requireLogin, (req, res) => {
    const formData = req.session.jobFormData || {};
    res.render('pages/job/submit', { ...formData, error: null });
});

// Handle Job Submission
router.post('/submit', requireLogin, async (req, res, next) => {
    const { title, text, url } = req.body;

    if (!title || !text) {
        return res.render('pages/job/submit', { 
            error: 'Title and Description are required', 
            title, 
            url, 
            text,
        });
    }

    try {
        await PostService.createPost({
            userId: req.session.user.id,
            title,
            url,
            content: text,
            isJob: true
        });
        delete req.session.jobFormData;
        res.redirect('/job/list');
    } catch (err) {
        console.error(err);
        req.session.jobFormData = { title, url, text };
        res.render('pages/job/submit', { 
            error: 'Submission failed', 
            title, 
            url, 
            text 
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
            isFavorited: !!post.isFavorited
        });
    } catch (err) {
        console.error('Error rendering job page:', err);
        next(err);
    }
});

module.exports = router;
