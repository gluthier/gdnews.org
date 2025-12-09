const express = require('express');
const bcrypt = require('bcrypt');
const database = require('../database');
const router = express.Router();

router.get('/register', (req, res) => {
    res.render('pages/register', { error: null, title: 'register' });
});

router.post('/register', async (req, res, next) => {
    const { username, password, email } = req.body;
    if (!username || !password) {
        return res.render('pages/register', { error: 'All fields are required', title: 'register' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await database.query('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', [username, hashedPassword, email || null]);
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.render('pages/register', { error: 'Username already exists', title: 'register' });
        }
        next(err);
    }
});

router.get('/login', (req, res) => {
    res.render('pages/login', { error: null, title: 'login' });
});

router.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const users = await database.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.render('pages/login', { error: 'Invalid username or password', title: 'login' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.render('pages/login', { error: 'Invalid username or password', title: 'login' });
        }

        req.session.user = { id: user.id, username: user.username };
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

router.get('/change-email', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('pages/change-email', { error: null, user: req.session.user, title: 'change email' });
});

router.post('/change-email', async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { email } = req.body;

    try {
        await database.query('UPDATE users SET email = ? WHERE id = ?', [email, req.session.user.id]);
        res.redirect(`/user?id=${req.session.user.username}`);
    } catch (err) {
        console.error(err);
        next(err);
    }
});

module.exports = router;
