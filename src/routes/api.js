const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const UserService = require('../services/user-service');
const PostService = require('../services/post-service');

// Load Public Key
let PUBLIC_KEY = process.env.BATCH_UPLOAD_PUBLIC_KEY;
// Try to load from root directory if env var not set
if (!PUBLIC_KEY) {
    const pubKeyPath = path.join(__dirname, '../../public.pem');
    if (fs.existsSync(pubKeyPath)) {
        PUBLIC_KEY = fs.readFileSync(pubKeyPath, 'utf8');
    }
}

if (!PUBLIC_KEY) {
    console.error('BATCH_UPLOAD_PUBLIC_KEY environment variable is not set and public.pem not found. Batch upload will be disabled.');
}

// Authentication Middleware
const authenticate = (req, res, next) => {
    if (!PUBLIC_KEY) {
        return res.status(500).json({ error: 'Server configuration error: parameters missing' });
    }

    const signature = req.headers['x-signature'];
    if (!signature) {
        return res.status(401).json({ error: 'Missing Signature' });
    }

    if (!req.rawBody) {
        return res.status(500).json({ error: 'Internal Server Error: Raw body missing' });
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

// Batch Upload Endpoint
router.post('/batch', authenticate, async (req, res) => {
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
router.get('/weekly-links', async (req, res) => {
    try {
        const posts = await PostService.getWeeklyLinks();
        res.json(posts);
    } catch (err) {
        console.error("Error fetching weekly links:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
