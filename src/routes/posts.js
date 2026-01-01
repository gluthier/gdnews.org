const express = require('express');
const database = require('../database/database');
const router = express.Router();
const requireLogin = require('../middleware/auth');
const PostService = require('../services/post-service');
const { fetchCommentsForPost } = require('../services/comment-service');
const SettingsService = require('../services/settings-service');

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
    
    if (SettingsService.isLocked('lock_posts')) {
        return res.render('pages/post/submit', { error: 'New post submissions are currently disabled.', title, url, description });
    }

    if (!title) {
        return res.render('pages/post/submit', { error: 'Title is required', title, url, description });
    }

    if (title.length > 180) {
        return res.render('pages/post/submit', { error: 'Title must be at most 180 characters long', title, url, description });
    }

    if (url && url.length > 2000) {
        return res.render('pages/post/submit', { error: 'URL must be at most 2000 characters long', title, url, description });
    }

    if (description && description.length > 10000) {
        return res.render('pages/post/submit', { error: 'Description must be at most 10000 characters long', title, url, description });
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

    if (SettingsService.isLocked('lock_comments')) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(403).json({ error: 'Comments are currently disabled.' });
        }
        return res.redirect(redirectUrl);
    }

    if (!content) {
        return res.redirect(redirectUrl);
    }

    if (content.length > 10000) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(400).json({ error: 'Comment too long' });
        }
        // Ideally we would show an error, but for now redirecting is the fallback behavior 
        // similar to empty content. 
        // A better approach would be to render the page with an error, 
        // but that requires fetching the post and all comments again.
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
        const isAdmin = req.session.user.user_type === 'admin';

        if (!post || (post.user_id !== req.session.user.id && !isAdmin)) {
            return res.status(403).send('Unauthorized');
        }

        await PostService.updatePostStatus(postId, 'removed');
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

// Handle Comment Removal
const CommentService = require('../services/comment-service');
router.post('/item/:id/comment/:commentId/remove', requireLogin, async (req, res, next) => {
    const postId = req.params.id;
    const commentId = req.params.commentId;
    try {
        const comment = await CommentService.getCommentById(commentId);
        const isAdmin = req.session.user.user_type === 'admin';

        if (!comment || (comment.user_id !== req.session.user.id && !isAdmin)) {
             return res.status(403).send('Unauthorized');
        }
        
        await CommentService.deleteComment(commentId);
        
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.json({ status: 'success' });
        }

        res.redirect(req.get('Referrer') || `/post/item/${postId}`);
    } catch (err) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(500).json({ error: 'Deletion failed' });
        }
        next(err);
    }
});

module.exports = router;
