const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const UserService = require('../services/user-service');
const SettingsService = require('../services/settings-service');

router.get('/register', (req, res) => {
    res.render('pages/auth/register', { 
        error: null, 
        title: 'register',
        metaDescription: "Register to gdnews, a video game design & development news aggregator to share healthy discussions with the community."
    });
});

router.post('/register', async (req, res, next) => {
    if (SettingsService.isLocked('lock_signup')) {
        return res.render('pages/auth/register', { 
            error: 'Account creation is currently disabled.', 
            title: 'register',
            metaDescription: "Register to gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    }

    const { username, password, email } = req.body;
    if (!username || !password) {
        return res.render('pages/auth/register', { 
            error: 'All fields are required', 
            title: 'register',
            username,
            email,
            metaDescription: "Register to gdnews, a video game design & development news aggregator to share healthy discussions with the community."
        });
    }

    if (password.length < 8 || password.length > 128) {
        return res.render('pages/auth/register', { 
            error: 'Password must be between 8 and 128 characters long', 
            title: 'register',
            username,
            email
        });
    }

    if (email && email.length > 254) {
        return res.render('pages/auth/register', { 
            error: 'Email must be at most 254 characters long', 
            title: 'register',
            username,
            email
        });
    }

    if (username.length < 3) {
        return res.render('pages/auth/register', { 
            error: 'Username must be at least 3 characters long', 
            title: 'register',
            username,
            email
        });
    }

    if (username.length > 24) {
        return res.render('pages/auth/register', { 
            error: 'Username must be at most 24 characters long', 
            title: 'register',
            username,
            email
        });
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
        return res.render('pages/auth/register', { 
            error: 'Username can only contain letters, numbers, underscores and hyphens', 
            title: 'register',
            username,
            email
        });
    }

    if (username.toLowerCase().includes('gdnews')) {
        return res.render('pages/auth/register', { 
            error: 'Username cannot contain "gdnews"', 
            title: 'register',
            username,
            email
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await UserService.createUser({ username, password_hash: hashedPassword, email });
        // Redirect to a page telling them to check email (or just login with a message)
        const successMessage = email 
            ? 'Registration successful! Please check your email to confirm your account.' 
            : 'Registration successful!';
        res.render('pages/auth/login', { error: null, success: successMessage, title: 'login' });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.render('pages/auth/register', { 
                error: 'Username already exists', 
                title: 'register',
                username,
                email
            });
        }
        next(err);
    }
});

router.get('/login', (req, res) => {
    res.render('pages/auth/login', { 
        error: null, 
        title: 'login',
        metaDescription: "Login to gdnews, a video game design & development news aggregator to share healthy discussions with the community"
    });
});

router.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const user = await UserService.getUserByUsername(username);
        if (!user) {
            return res.render('pages/auth/login', { error: 'Invalid username or password', title: 'login' });
        }
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.render('pages/auth/login', { error: 'Invalid username or password', title: 'login' });
        }

        // Check if user is banned
        const banDetails = await UserService.checkBanStatus(user);
        if (banDetails) {
            let message = 'Your account has been banned.';
            if (banDetails.until) {
                const dateStr = banDetails.until.toLocaleString();
                message = `Your account has been banned until ${dateStr}.`;
            } else if (banDetails.type === 'LifeBanned') {
                message = 'Your account has been permanently banned.';
            }
            return res.render('pages/auth/login', { error: message, title: 'login' });
        }

        req.session.user = { 
            id: user.id, 
            username: user.username, 
            email: user.email,
            user_type: user.user_type
        };

        // Update last connection asynchronously
        UserService.updateLastConnection(user.id).catch(err => console.error('Failed to update last connection:', err));

        res.redirect('/');
    } catch (err) {
        console.error(err);
        next(err);
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

router.get('/confirm-email', async (req, res, next) => {
    const { token } = req.query;
    try {
        await UserService.verifyAndComplete(token);
        res.render('pages/auth/login', { error: null, success: 'Email verified! You can now log in.', title: 'login' });
    } catch (err) {
        res.render('pages/auth/login', { error: 'Invalid or expired confirmation token.', title: 'login' });
    }
});

router.get('/confirm-change-email', async (req, res, next) => {
    const { token } = req.query;
    try {
        await UserService.verifyAndComplete(token);
        // If user is logged in, redirect to profile. Otherwise login.
        if (req.session.user) {
             res.redirect(`/user/profile/${req.session.user.username}?success=${encodeURIComponent('Email changed successfully!')}`);
        } else {
             res.render('pages/auth/login', { error: null, success: 'Email changed successfully! Please log in.', title: 'login' });
        }
    } catch (err) {
         res.render('pages/auth/login', { error: 'Invalid or expired confirmation token.', title: 'login' });
    }
});

router.get('/forgot-password', (req, res) => {
    res.render('pages/auth/forgot-password', { 
        title: 'forgot password',
        metaDescription: "Reset your gdnews account password."
    });
});

router.post('/forgot-password', async (req, res, next) => {
    const { email } = req.body;
    try {
        await UserService.initiatePasswordReset(email);
        // Always show success to prevent email enumeration
        res.render('pages/auth/forgot-password', {
            success: 'A password reset link has been sent to your email (if it exists).',
            title: 'forgot password'
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

router.get('/reset-password', async (req, res, next) => {
    const { token } = req.query;
    try {
        const request = await UserService.verifyResetToken(token);
        if (!request) {
            return res.render('pages/auth/login', { error: 'Invalid or expired reset token.', title: 'login' });
        }
        res.render('pages/auth/reset-password', {
            token,
            title: 'reset password'
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});

router.post('/reset-password', async (req, res, next) => {
    const { token, password, confirm_password } = req.body;
    
    if (password !== confirm_password) {
        return res.render('pages/auth/reset-password', { 
            token,
            error: 'Passwords do not match',
            title: 'reset password'
        });
    }

    if (password.length < 8 || password.length > 128) {
        return res.render('pages/auth/reset-password', { 
            token,
            error: 'Password must be between 8 and 128 characters long', 
            title: 'reset password'
        });
    }

    try {
        await UserService.resetPassword(token, password);
        res.render('pages/auth/login', { 
            success: 'Password reset successful! You can now log in with your new password.',
            title: 'login'
        });
    } catch (err) {
        console.error(err);
        res.render('pages/auth/login', { 
            error: 'Failed to reset password. The link may have expired.',
            title: 'login'
        });
    }
});

module.exports = router;
