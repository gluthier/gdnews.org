const UserService = require('../services/user-service');

/**
 * Middleware to check if user is logged in
 */
const requireLogin = async (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/auth/login');
    }

    try {
        // Check ban status
        const banDetails = await UserService.checkBanStatus(req.session.user);
        if (banDetails) {
            req.session.destroy();
            
            let message = 'Your account has been banned.';
            if (banDetails.until) {
                const dateStr = banDetails.until.toLocaleString();
                message = `Your account has been banned until ${dateStr}.`;
            } else if (banDetails.type === 'LifeBanned') {
                message = 'Your account has been permanently banned.';
            }

            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.status(403).json({ error: 'Account Banned', details: message });
            }
            return res.render('pages/auth/login', { error: message });
        }
    } catch (err) {
        console.error('Error checking ban status:', err);
        // Continue but maybe log error? Or fail safe? 
        // Failing safe might be better if DB is down.
    }

    next();
};

module.exports = requireLogin;
