const express = require('express');
const router = express.Router();
const UserService = require('../services/user-service');
const CommentService = require('../services/comment-service');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.user_type === 'admin') {
        return next();
    }
    const err = new Error('Forbidden');
    err.status = 403;
    next(err);
};

router.use(isAdmin);

// Default to comments list
router.get('/', (req, res) => {
    res.redirect('/moderation/comments');
});

// Comments list
router.get('/comments', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const { comments, count } = await CommentService.getAllComments({ page, limit });
        const userCount = await UserService.getUserCount();

        res.render('pages/moderation/index', {
            title: 'Moderation - Comments',
            user: req.session.user,
            moderationType: 'comments',
            items: comments,
            page,
            totalPages: Math.ceil(count / limit),
            nextPage: page < Math.ceil(count / limit) ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null,
            userCount,
            commentCount: count,
            csrfToken: req.csrfToken()
        });
    } catch (err) {
        next(err);
    }
});

// Users list
router.get('/users', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const { users, count } = await UserService.getAllUsers({ page, limit });
        const commentCount = await CommentService.getCommentCount();

        res.render('pages/moderation/index', {
            title: 'Moderation - Users',
            user: req.session.user,
            moderationType: 'users',
            items: users,
            page,
            totalPages: Math.ceil(count / limit),
            nextPage: page < Math.ceil(count / limit) ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null,
            userCount: count,
            commentCount,
            csrfToken: req.csrfToken()
        });
    } catch (err) {
        next(err);
    }
});

// Ban User
router.post('/user/:id/ban', async (req, res, next) => {
    try {
        const userId = req.params.id;
        const banType = req.body.banType; // '24hBanned', '7dBanned', 'LifeBanned'
        const returnTo = req.body.returnTo;
        
        await UserService.banUser(userId, banType);
        
        res.redirect(returnTo || req.get('Referrer') || '/moderation/comments');
    } catch (err) {
        next(err);
    }
});

// Delete Comment
router.post('/comment/:id/delete', async (req, res, next) => {
    try {
        const commentId = req.params.id;
        await CommentService.deleteComment(commentId);
        
        res.redirect(req.get('Referrer') || '/moderation/comments');
    } catch (err) {
        next(err);
    }
});

// API: Get Comment
router.get('/api/comment/:id', async (req, res, next) => {
    try {
        const commentId = req.params.id;
        const comment = await CommentService.getCommentById(commentId);
        
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        // Also fetch user to get username
        const user = await UserService.getUserById(comment.user_id);
        
        res.json({
            ...comment,
            username: user ? user.username : '[deleted]'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
