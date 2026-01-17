const request = require('supertest');

// Mock express-session to avoid internal logic issues
jest.mock('express-session', () => {
    return () => (req, res, next) => {
        req.session = req.session || {};
        req.session.regenerate = (cb) => cb();
        req.session.destroy = (cb) => cb();
        req.session.save = (cb) => cb();
        next();
    };
});

const app = require('../../src/server');
const database = require('../../src/database/database');
const PostService = require('../../src/services/post-service');

// Mock helpers for authentication
jest.mock('../../src/middleware/auth', () => (req, res, next) => {
    const userId = req.headers['x-test-user-id'];
    const userType = req.headers['x-test-user-type'];
    if (userId) {
        req.session.user = {
                 id: parseInt(userId),
                 username: 'test',
                 user_type: userType || 'normal'
        };
        next();
    } else {
        res.redirect('/auth/login');
    }
});

describe('Post Modification Routes', () => {
    let adminUser, regularUser, testPost;

    beforeAll(async () => {
        // Cleanup potential leftovers
        const existingUsers = await database.query('SELECT id FROM users WHERE username IN (?, ?)', ['admin_mod', 'user_mod']);
        if (existingUsers.length > 0) {
            const userIds = existingUsers.map(u => u.id);
            
            // Get posts by these users
            const posts = await database.query('SELECT id FROM posts WHERE user_id IN (?)', [userIds]);
            if (posts.length > 0) {
                const postIds = posts.map(p => p.id);
                // Delete comments on these posts
                await database.query('DELETE FROM comments WHERE post_id IN (?)', [postIds]);
                // Delete favorites on these posts
                await database.query('DELETE FROM favourites WHERE post_id IN (?)', [postIds]);
                // Delete the posts
                await database.query('DELETE FROM posts WHERE id IN (?)', [postIds]);
            }

            // Delete comments made by these users
            await database.query('DELETE FROM comments WHERE user_id IN (?)', [userIds]);
            // Delete favorites made by these users
            await database.query('DELETE FROM favourites WHERE user_id IN (?)', [userIds]);

            // Finally delete users
            await database.query('DELETE FROM users WHERE id IN (?)', [userIds]);
        }

        // Setup users and post
        const adminRes = await database.query('INSERT INTO users (username, email, password_hash, user_type) VALUES (?, ?, ?, ?) RETURNING id', ['admin_mod', 'admin_mod@example.com', 'pass', 'admin']);
        adminUser = { id: adminRes[0].id, username: 'admin_mod', user_type: 'admin' };

        const regRes = await database.query('INSERT INTO users (username, email, password_hash, user_type) VALUES (?, ?, ?, ?) RETURNING id', ['user_mod', 'user_mod@example.com', 'pass', 'normal']);
        regularUser = { id: regRes[0].id, username: 'user_mod', user_type: 'normal' };

        const postRes = await database.query('INSERT INTO posts (user_id, title, url, description) VALUES (?, ?, ?, ?) RETURNING id', [regularUser.id, 'Test Post Mod', 'http://example.com', 'Desc']);
        testPost = { id: postRes[0].id, title: 'Test Post Mod' };
    });

    afterAll(async () => {
        // Cleanup
        if (testPost) {
            await database.query('DELETE FROM posts WHERE id = ?', [testPost.id]);
        }
        if (adminUser && regularUser) {
            await database.query('DELETE FROM users WHERE id IN (?, ?)', [adminUser.id, regularUser.id]);
        }
        await database.close();
    });

    describe('GET /post/item/:id/modify', () => {
        it('should allow admin to access modify page', async () => {
            const res = await request(app)
                .get(`/post/item/${testPost.id}/modify`)
                .set('X-Test-User-Id', adminUser.id)
                .set('X-Test-User-Type', 'admin');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Modify Post');
        });

        it('should deny regular user access', async () => {
            const res = await request(app)
                .get(`/post/item/${testPost.id}/modify`)
                .set('X-Test-User-Id', regularUser.id)
                .set('X-Test-User-Type', 'normal');
            expect(res.statusCode).toBe(403);
        });
    });

    describe('POST /post/item/:id/modify', () => {
        it('should allow admin to modify post', async () => {
            const newTitle = 'Updated Title by Admin';
            const res = await request(app)
                .post(`/post/item/${testPost.id}/modify`)
                .set('X-Test-User-Id', adminUser.id)
                .set('X-Test-User-Type', 'admin')
                .type('form')
                .send({
                    title: newTitle,
                    url: 'http://updated.com',
                    description: 'Updated Desc',
                    _csrf: 'testtoken'
                });
            
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe(`/post/item/${testPost.id}`);

            const updatedPost = await PostService.getPostById(testPost.id);
            expect(updatedPost.title).toBe(newTitle);
        });

        it('should deny regular user modification', async () => {
            const res = await request(app)
                .post(`/post/item/${testPost.id}/modify`)
                .set('X-Test-User-Id', regularUser.id)
                .set('X-Test-User-Type', 'normal')
                .type('form')
                .send({
                    title: 'Hacked Title',
                    url: 'http://hacked.com',
                    description: 'Hacked Desc'
                });
            expect(res.statusCode).toBe(403);
        });
    });
});
