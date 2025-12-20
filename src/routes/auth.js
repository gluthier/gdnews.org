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
        return res.render('pages/auth/register', { error: 'All fields are required', title: 'register' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await UserService.createUser({ username, password_hash: hashedPassword, email });
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.render('pages/auth/register', { error: 'Username already exists', title: 'register' });
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

        req.session.user = { id: user.id, username: user.username };
        res.redirect('/post/list');
    } catch (err) {
        console.error(err);
        next(err);
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/post/list');
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/post/list');
});

module.exports = router;
