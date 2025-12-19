const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile) });

const express = require('express');
const bodyParser = require('body-parser');
const database = require('../database');
const bcrypt = require('bcrypt');

const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.BATCH_UPLOAD_PORT || 3001;

// Load Public Key
let PUBLIC_KEY = process.env.BATCH_UPLOAD_PUBLIC_KEY;
if (!PUBLIC_KEY && fs.existsSync('public.pem')) {
    PUBLIC_KEY = fs.readFileSync('public.pem', 'utf8');
}

if (!PUBLIC_KEY) {
    console.error('BATCH_UPLOAD_PUBLIC_KEY environment variable is not set and public.pem not found.');
    process.exit(1);
}

// Middleware to capture raw body for signature verification
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Authentication Middleware
const authenticate = (req, res, next) => {
    const signature = req.headers['x-signature'];
    if (!signature) {
        return res.status(401).json({ error: 'Missing Signature' });
    }

    try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(req.rawBody);
        const isVerified = verifier.verify(PUBLIC_KEY, signature, 'base64');

        if (!isVerified) {
            return res.status(401).json({ error: 'Invalid Signature' });
        }
        next();
    } catch (err) {
        console.error('Verification error:', err);
        return res.status(401).json({ error: 'Authentication Failed' });
    }
};

// Ensure 'bot' user exists
const ensureBotUser = async () => {
    try {
        const users = await database.query("SELECT id FROM users WHERE username = 'gdnews-bot'");
        if (users.length === 0) {
            console.log("Creating 'gdnews-bot' user...");
            const password = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);
            await database.query(
                "INSERT INTO users (username, password_hash, email) VALUES ('gdnews-bot', ?, 'gdnews-bot@gdnews.org')",
                [hashedPassword]
            );
            console.log("'gdnews-bot' user created.");
        }
    } catch (err) {
        console.error("Error ensuring gdnews-bot user:", err);
        process.exit(1);
    }
};

// Batch Upload Endpoint
app.post('/batch', authenticate, async (req, res) => {
    const posts = req.body;

    if (!Array.isArray(posts)) {
        return res.status(400).json({ error: 'Body must be an array of posts' });
    }

    try {
        const botUser = await database.query("SELECT id FROM users WHERE username = 'gdnews-bot'");
        if (botUser.length === 0) {
             return res.status(500).json({ error: "gdnews-bot user not found" });
        }
        const userId = botUser[0].id;

        let addedCount = 0;
        for (const post of posts) {
             if (!post.title) continue; // Skip invalid posts

             await database.query(
                'INSERT INTO posts (user_id, title, url, content) VALUES (?, ?, ?, ?)',
                [userId, post.title, post.url || null, post.content || null]
            );
            addedCount++;
        }

        res.json({ message: `Successfully added ${addedCount} posts.` });

    } catch (err) {
        console.error("Batch upload error:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Weekly Links Endpoint
app.get('/weekly-links', async (req, res) => {
    try {
        const query = `
            SELECT title, url 
            FROM posts 
            WHERE url IS NOT NULL 
              AND url != '' 
              AND created_at >= NOW() - INTERVAL 7 DAY 
            ORDER BY created_at DESC
        `;
        const posts = await database.query(query);
        res.json(posts);
    } catch (err) {
        console.error("Error fetching weekly links:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start Server
// Start Server
ensureBotUser().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`Batch upload server running on port ${PORT}`);
    });

    const gracefulShutdown = () => {
        console.log('Batch Server: Received kill signal, shutting down gracefully');
        server.close(() => {
            console.log('Batch Server: Closed out remaining connections');
            database.close().then(() => {
                 console.log('Batch Server: Database pool closed');
                 process.exit(0);
            }).catch((err) => {
                 console.error('Batch Server: Error closing database pool', err);
                 process.exit(1);
            });
        });

        setTimeout(() => {
            console.error('Batch Server: Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
});
