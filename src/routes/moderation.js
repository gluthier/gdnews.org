const express = require('express');
const router = express.Router();
const UserService = require('../services/user-service');
const CommentService = require('../services/comment-service');
const SettingsService = require('../services/settings-service');

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

        const settings = await SettingsService.getAll();

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
            csrfToken: req.csrfToken(),
            settings
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

        const settings = await SettingsService.getAll();

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
            csrfToken: req.csrfToken(),
            settings
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

// Delete User (only if permanently banned)
router.post('/user/:id/delete', async (req, res, next) => {
    try {
        const userId = req.params.id;
        const currentUserId = String(req.session.user.id);
        if (String(userId) === currentUserId) {
            const err = new Error('Cannot delete your own account');
            err.status = 400;
            throw err;
        }

        const targetUser = await UserService.getUserById(userId);
        if (!targetUser) {
            const err = new Error('User not found');
            err.status = 404;
            throw err;
        }

        if (targetUser.ban_type !== 'LifeBanned') {
            const err = new Error('Only permanently banned users can be deleted');
            err.status = 400;
            throw err;
        }

        await UserService.deleteUserAccount(userId);
        res.redirect(req.get('Referrer') || '/moderation/users');
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

// Update Settings
router.post('/settings', async (req, res, next) => {
    try {
        const { key, value } = req.body;
        // value passed as string 'true' or 'false'
        const boolValue = value === 'true';
        
        // Allowed keys
        const allowedKeys = ['lock_signup', 'lock_posts', 'lock_comments', 'lock_global'];
        if (!allowedKeys.includes(key)) {
            throw new Error('Invalid setting key');
        }

        await SettingsService.set(key, boolValue);
        
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.json({ success: true, key, value: boolValue });
        }
        res.redirect(req.get('Referrer') || '/moderation');
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
            username: user ? user.username : '[removed]'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
