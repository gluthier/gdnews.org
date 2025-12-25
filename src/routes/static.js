const express = require('express');
const router = express.Router();

// Static pages
router.get('/about', (req, res) => {
    res.render('pages/info/about', { 
        title: 'About',
        metaDescription: "Learn more about gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

router.get('/guidelines', (req, res) => {
    res.render('pages/info/guidelines', { 
        title: 'Guidelines',
        metaDescription: "Community guidelines for gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

router.get('/legal', (req, res) => {
    res.render('pages/info/legal', { 
        title: 'Legal',
        metaDescription: "Legal information for gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

router.get('/tos', (req, res) => {
    res.render('pages/info/tos', { 
        title: 'Terms of Service',
        metaDescription: "Terms of Service for gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

router.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

module.exports = router;
