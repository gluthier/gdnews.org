/**
 * Middleware to check if user is logged in
 */
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/auth/login');
    }
    next();
};

module.exports = requireLogin;
