const express = require('express');
const database = require('../database/database');
const router = express.Router();
const requireLogin = require('../middleware/auth');
const PostService = require('../services/post-service');
const { fetchCommentsForPost } = require('../services/comment-service');

// List posts (Home) - Redirect to root
router.get('/list', (req, res) => {
    res.redirect('/');
});

// List posts (Newest)
router.get('/newest', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/post/newest');
    const limit = 30;

    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ userId, page, limit, type: 'newest' });

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/post/newest?page=${page + 1}`;
        }

        res.render('pages/post/newest', { 
            posts, 
            title: 'newest', 
            nextPageUrl,
            metaDescription: "The newest posts submitted on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Show submit form
router.get('/submit', requireLogin, (req, res) => {
    const formData = req.session.postFormData || {};
    res.render('pages/post/submit', { 
        ...formData, 
        error: null,
        metaDescription: "Submit a new post on gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

// Handle submission
router.post('/submit', requireLogin, async (req, res, next) => {
    const { title, url, description } = req.body;
    if (!title) {
        return res.render('pages/post/submit', { error: 'Title is required', title, url, description });
    }

    if (url && (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('data:'))) {
        return res.render('pages/post/submit', { error: 'Invalid URL scheme', title, url, description });
    }

    try {
        await PostService.createPost({
            userId: req.session.user.id,
            title,
            url,
            description
        });
        delete req.session.postFormData;
        res.redirect('/');
    } catch (err) {
        console.error(err);
        req.session.postFormData = { title, url, description };
        res.render('pages/post/submit', { error: err.message || 'Submission failed', title, url, description });
    }
});

// Show post details
router.get('/item/:id', async (req, res, next) => {
    const postId = req.params.id;
    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const post = await PostService.getPostById(postId, userId);

        if (!post) {
            const err = new Error('Post not found');
            err.status = 404;
            return next(err);
        }

        const rootComments = await fetchCommentsForPost(postId);

        res.render('pages/post/item', { 
            post, 
            basePath: '/post/item/',
            comments: rootComments, 
            error: null, 
            title: post.title, 
            isFavorited: !!post.isFavorited,
            metaDescription: `Post from gdnews: ${post.title}`
        });
    } catch (err) {
        console.error('Error rendering item page:', err);
        next(err);
    }
});

// Handle comment
router.post('/item/:id/comment', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    const { content, parent_comment_id } = req.body;

    const redirectUrl = req.get('Referrer') || `/post/item/${postId}`;

    if (!content) {
        return res.redirect(redirectUrl);
    }

    try {
        const result = await PostService.addComment({
            postId,
            userId: req.session.user.id,
            content,
            parentCommentId: parent_comment_id || null
        });

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
                ...newComment,
                csrfToken: req.csrfToken(),
                post: { id: postId }
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

router.get('/favorite/:id', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    try {
        await PostService.favorite(req.session.user.id, postId);
        res.redirect(req.get('Referrer') || `/post/item/${postId}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});


router.get('/unfavorite/:id', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    try {
        await PostService.unfavorite(req.session.user.id, postId);
        res.redirect(req.get('Referrer') || `/post/item/${postId}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Handle Post Removal
router.post('/item/:id/remove', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    try {
        const post = await PostService.getPostById(postId, req.session.user.id);

        if (!post || post.user_id !== req.session.user.id) {
            return res.status(403).send('Unauthorized');
        }

        await PostService.updatePostStatus(postId, 'removed');
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

module.exports = router;
