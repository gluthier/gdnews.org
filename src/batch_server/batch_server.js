const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile) });

const bcrypt = require('bcrypt');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

const bodyParser = require('body-parser');
const UserService = require('../services/user-service');
const PostService = require('../services/post-service');
const database = require('../database/database');

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
        await UserService.ensureBotUser();
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
        const botUser = await UserService.getUserByUsername('gdnews-bot');
        if (!botUser) {
             return res.status(500).json({ error: "gdnews-bot user not found" });
        }
        const userId = botUser.id;

        let addedCount = 0;
        for (const post of posts) {
             if (!post.title) continue; // Skip invalid posts

             await PostService.createPost({
                userId,
                title: post.title,
                url: post.url,
                content: post.content
            });
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
        const posts = await PostService.getWeeklyLinks();
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
