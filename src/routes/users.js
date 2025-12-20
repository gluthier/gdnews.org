const express = require('express');
const router = express.Router();

const UserService = require('../services/user-service');
const PostService = require('../services/post-service');

// User profile page
router.get('/user/:username', async (req, res, next) => {
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
        if (page < 1) return res.redirect(`/user/${username}`);
        const limit = 30;

        const currentTab = req.query.tab || 'submissions';

        if (currentTab === 'favorites') {
            if (!req.session.user || req.session.user.id !== user.id) {
                return res.redirect(`/user/${username}`);
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
            nextPageUrl = `/user/${username}?page=${page + 1}&tab=${currentTab}`;
        }

        res.render('pages/user', { profileUser: user, posts, title: `${user.username}`, nextPageUrl, currentTab });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Redirect old /user?id=xyz to /user/xyz
router.get('/user', (req, res) => {
    if (req.query.id) {
        return res.redirect(`/user/${req.query.id}`);
    }
    res.redirect('/');
});

module.exports = router;
