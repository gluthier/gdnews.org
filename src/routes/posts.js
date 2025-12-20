const express = require('express');
const database = require('../database/database');
const router = express.Router();
const requireLogin = require('../middleware/auth');
const PostService = require('../services/post-service');
const { fetchCommentsForPost } = require('../services/comment-service');

// List posts (Home)
router.get('/list', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/post/list');
    const limit = 30;

    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ userId, page, limit, type: 'home' });

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/post/list?page=${page + 1}`;
        }

        res.render('pages/post/list', { posts, nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
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

        res.render('pages/post/newest', { posts, title: 'newest', nextPageUrl });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Show submit form
router.get('/submit', requireLogin, (req, res) => {
    const formData = req.session.postFormData || {};
    res.render('pages/post/submit', { ...formData, error: null });
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
        res.redirect('/post/list');
    } catch (err) {
        console.error(err);
        req.session.postFormData = { title, url, description };
        res.render('pages/post/submit', { error: 'Submission failed', title, url, description });
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
            isFavorited: !!post.isFavorited 
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

module.exports = router;
