const express = require('express');
const router = express.Router();

const UserService = require('../services/user-service');
const PostService = require('../services/post-service');

// User profile page
router.get('/profile/:username', async (req, res, next) => {
    const username = req.params.username;
    if (!username) {
        const err = new Error('User not specified');
        err.status = 404;
        return next(err);
    }

    try {
        const user = await UserService.getUserByUsername(username);
        if (!user) {
            const err = new Error('User not found');
            err.status = 404;
            return next(err);
        }

        const page = parseInt(req.query.page) || 1;
        if (page < 1) return res.redirect(`/user/profile/${username}`);
        const limit = 30;

        const currentTab = req.query.tab || 'submissions';

        if (currentTab === 'favorites') {
            if (!req.session.user || req.session.user.id !== user.id) {
                return res.redirect(`/user/profile/${username}`);
            }
        }

        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ 
            userId, 
            page, 
            limit, 
            type: currentTab === 'favorites' ? 'user_favorites' : 'user_submissions',
            targetId: username
        });

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/user/profile/${username}?page=${page + 1}&tab=${currentTab}`;
        }

        res.render('pages/user', { profileUser: user, posts, title: `${user.username}`, nextPageUrl, currentTab });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Redirect old /user?id=xyz to /user/profile/xyz
router.get('/profile', (req, res) => {
    if (req.query.id) {
        return res.redirect(`/user/profile/${req.query.id}`);
    }
    res.redirect('/post/list');
});

router.get('/change-email', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.render('pages/change-email', { error: null, user: req.session.user, title: 'change email' });
});

router.post('/change-email', async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    const { email } = req.body;

    try {
        await UserService.updateUserEmail(req.session.user.id, email);
        res.redirect(`/user/profile/${req.session.user.username}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
