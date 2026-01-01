const request = require('supertest');

// Mock express-handlebars to avoid template rendering issues
jest.mock('express-handlebars', () => ({
    engine: jest.fn(() => (path, options, callback) => {
        callback(null, `Rendered ${path} with ${JSON.stringify(options)}`);
    })
}));

// Mock database
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock middleware
jest.mock('../../src/middleware/auth', () => (req, res, next) => {
    req.session = req.session || {};
    req.session.user = { id: 1, username: 'testuser', user_type: 'admin' };
    res.locals.user = req.session.user;
    next();
});

// Mock services
const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn(),
    getPostById: jest.fn(),
    createPost: jest.fn(),
    addComment: jest.fn(),
    favorite: jest.fn(),
    unfavorite: jest.fn(),
    updatePostLockStatus: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));

const SettingsService = require('../../src/services/settings-service');
jest.mock('../../src/services/settings-service', () => ({
    isLocked: jest.fn().mockReturnValue(false)
}));

jest.mock('csurf', () => () => (req, res, next) => {
    req.csrfToken = () => 'mock-token';
    next();
});

const app = require('../../src/server');

describe('Post Locking Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /post/item/:id/lock', () => {
        test('allows admin to lock a post', async () => {
            PostService.updatePostLockStatus.mockResolvedValue();
            
            const res = await request(app)
                .post('/post/item/1/lock')
                .send();
            
            expect(res.statusCode).toEqual(302);
            expect(PostService.updatePostLockStatus).toHaveBeenCalledWith('1', true);
        });
    });

    describe('POST /post/item/:id/unlock', () => {
        test('allows admin to unlock a post', async () => {
            PostService.updatePostLockStatus.mockResolvedValue();
            
            const res = await request(app)
                .post('/post/item/1/unlock')
                .send();
            
            expect(res.statusCode).toEqual(302);
            expect(PostService.updatePostLockStatus).toHaveBeenCalledWith('1', false);
        });
    });

    describe('Comment Submission on Locked Post', () => {
        test('rejects comment when post is locked', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, is_locked: true });

            const res = await request(app)
                .post('/post/item/1/comment')
                .type('form')
                .send({ content: 'Nice post!' });
            
            expect(res.statusCode).toEqual(302);
            expect(PostService.addComment).not.toHaveBeenCalled();
        });

        test('rejects JSON comment when post is locked', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, is_locked: true });

            const res = await request(app)
                .post('/post/item/1/comment')
                .set('Accept', 'application/json')
                .type('form')
                .send({ content: 'Nice post!' });
            
            expect(res.statusCode).toEqual(403);
            expect(res.body.error).toBe('This post is locked.');
            expect(PostService.addComment).not.toHaveBeenCalled();
        });

        test('allows comment when post is unlocked', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, is_locked: false });
            PostService.addComment.mockResolvedValue({ insertId: 100 });

            const res = await request(app)
                .post('/post/item/1/comment')
                .type('form')
                .send({ content: 'Nice post!' });
            
            expect(res.statusCode).toEqual(302);
            expect(PostService.addComment).toHaveBeenCalled();
        });
    });
});
