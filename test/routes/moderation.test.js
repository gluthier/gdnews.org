const request = require('supertest');

// Mock database
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock services
const UserService = require('../../src/services/user-service');
const CommentService = require('../../src/services/comment-service');

jest.mock('../../src/services/user-service', () => ({
    getAllUsers: jest.fn(),
    getUserCount: jest.fn(),
    checkBanStatus: jest.fn().mockResolvedValue(false)
}));

jest.mock('../../src/services/comment-service', () => ({
    getAllComments: jest.fn(),
    getCommentCount: jest.fn()
}));

jest.mock('csurf', () => () => (req, res, next) => {
    req.csrfToken = () => 'mock-token';
    next();
});

// Dynamic session mock
const mockSessionMiddleware = jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.session.user = global.testUser;
    next();
});

jest.mock('express-session', () => () => mockSessionMiddleware);

const app = require('../../src/server');

describe('Moderation Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.testUser = null; // Default to no user
    });

    describe('Access Control', () => {
        test('GET /moderation returns 403 for guest', async () => {
             // global.testUser is null
             const res = await request(app).get('/moderation');
             expect(res.statusCode).toBe(403);
        });

        test('GET /moderation returns 403 for normal user', async () => {
            global.testUser = { id: 1, username: 'normal', user_type: 'normal' };
            const res = await request(app).get('/moderation');
            expect(res.statusCode).toBe(403);
        });

        test('GET /moderation redirects to /moderation/comments for admin', async () => {
            global.testUser = { id: 1, username: 'admin', user_type: 'admin' };
            const res = await request(app).get('/moderation');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/moderation/comments');
        });
    });

    describe('GET /moderation/users', () => {
        beforeEach(() => {
            global.testUser = { id: 1, username: 'admin', user_type: 'admin' };
            UserService.getAllUsers.mockResolvedValue({
                users: [{ id: 2, username: 'user2', user_type: 'normal' }],
                count: 1
            });
            CommentService.getCommentCount.mockResolvedValue(10);
        });

        test('renders user list for admin', async () => {
            const res = await request(app).get('/moderation/users');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Moderation');
            expect(res.text).toContain('user2');
            expect(UserService.getAllUsers).toHaveBeenCalledWith({ page: 1, limit: 50 });
        });

        test('handles pagination', async () => {
            const res = await request(app).get('/moderation/users?page=2');
            expect(res.statusCode).toBe(200);
            expect(UserService.getAllUsers).toHaveBeenCalledWith({ page: 2, limit: 50 });
        });
    });

    describe('GET /moderation/comments', () => {
        beforeEach(() => {
            global.testUser = { id: 1, username: 'admin', user_type: 'admin' };
            CommentService.getAllComments.mockResolvedValue({
                comments: [{ id: 10, content: 'Some comment', username: 'user2', post_title: 'Test Post' }],
                count: 1
            });
            UserService.getUserCount.mockResolvedValue(5);
        });

        test('renders user list for admin', async () => {
            const res = await request(app).get('/moderation/users');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Moderation');
            expect(res.text).toContain('user2');
            expect(UserService.getAllUsers).toHaveBeenCalledWith({ page: 1, limit: 50 });
        });

        test('handles pagination', async () => {
            const res = await request(app).get('/moderation/users?page=2');
            expect(res.statusCode).toBe(200);
            expect(UserService.getAllUsers).toHaveBeenCalledWith({ page: 2, limit: 50 });
        });
    });

    describe('GET /moderation/comments', () => {
        beforeEach(() => {
            global.testUser = { id: 1, username: 'admin', user_type: 'admin' };
            CommentService.getAllComments.mockResolvedValue({
                comments: [{ id: 10, content: 'Some comment', username: 'user2', post_title: 'Test Post' }],
                count: 1
            });
        });

        test('renders comment list for admin', async () => {
            const res = await request(app).get('/moderation/comments');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Moderation');
            expect(res.text).toContain('Some comment');
            expect(CommentService.getAllComments).toHaveBeenCalledWith({ page: 1, limit: 50 });
        });

        test('handles pagination', async () => {
            const res = await request(app).get('/moderation/comments?page=2');
            expect(res.statusCode).toBe(200);
            expect(CommentService.getAllComments).toHaveBeenCalledWith({ page: 2, limit: 50 });
        });
    });
});
