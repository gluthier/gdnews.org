const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const UserService = require('../services/user-service');

router.get('/register', (req, res) => {
    res.render('pages/auth/register', { error: null, title: 'register' });
});

router.post('/register', async (req, res, next) => {
    const { username, password, email } = req.body;
    if (!username || !password) {
        return res.render('pages/auth/register', { 
            error: 'All fields are required', 
            title: 'register',
            username,
            email
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await UserService.createUser({ username, password_hash: hashedPassword, email });
        // Redirect to a page telling them to check email (or just login with a message)
        res.render('pages/auth/login', { error: null, success: 'Registration successful! Please check your email to confirm your account.', title: 'login' });
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
    res.render('pages/auth/login', { error: null, title: 'login' });
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

        req.session.user = { id: user.id, username: user.username, email: user.email };
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

module.exports = router;
