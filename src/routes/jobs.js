const express = require('express');
const database = require('../database');
const router = express.Router();

const requireLogin = require('../middleware/auth');
const PostService = require('../services/post-service');
const { fetchCommentsForPost } = require('../services/comment-service');

// Jobs Page
router.get('/jobs', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/jobs');
    const limit = 30;

    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ userId, page, limit, type: 'jobs' });

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
        await PostService.createPost({
            userId: req.session.user.id,
            title,
            url,
            content: text,
            isJob: true
        });
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
        const userId = req.session.user ? req.session.user.id : -1;
        const post = await PostService.getPostById(jobId, userId);

        if (!post || !post.is_job) {
            const err = new Error('Job not found');
            err.status = 404;
            return next(err);
        }

        const comments = await fetchCommentsForPost(jobId);

        res.render('pages/job', { 
            job: post, 
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
