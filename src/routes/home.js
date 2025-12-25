const express = require('express');
const router = express.Router();
const PostService = require('../services/post-service');

// List posts (Home)
router.get('/', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) return res.redirect('/');
    const limit = 30;

    try {
        const userId = req.session.user ? req.session.user.id : -1;
        const posts = await PostService.getPosts({ userId, page, limit, type: 'home' });

        let nextPageUrl = null;
        if (posts.length > limit) {
            posts.pop();
            nextPageUrl = `/?page=${page + 1}`;
        }

        res.render('pages/post/list', { 
            posts, 
            nextPageUrl,
            metaDescription: "Video game design & development news aggregator to share healthy discussions with the community"
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
