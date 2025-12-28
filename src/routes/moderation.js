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
            commentCount
        });
    } catch (err) {
        next(err);
    }
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
            commentCount: count
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
