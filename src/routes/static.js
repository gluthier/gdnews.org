const express = require('express');
const router = express.Router();

// Static pages
router.get('/about', (req, res) => {
    res.render('pages/info/about', { title: 'About' });
});

router.get('/guidelines', (req, res) => {
    res.render('pages/info/guidelines', { title: 'Guidelines' });
});

router.get('/legal', (req, res) => {
    res.render('pages/info/legal', { title: 'Legal' });
});

router.get('/tos', (req, res) => {
    res.render('pages/info/tos', { title: 'Terms of Service' });
});

module.exports = router;
