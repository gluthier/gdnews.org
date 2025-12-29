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
    banUser: jest.fn(),
    checkBanStatus: jest.fn().mockResolvedValue(false), // Mock ban status check
}));

jest.mock('../../src/services/comment-service', () => ({
    getAllComments: jest.fn(),
    getCommentCount: jest.fn(),
    deleteComment: jest.fn(),
    updateComment: jest.fn(),
    getCommentById: jest.fn(),
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

describe('Moderation Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.testUser = { id: 1, username: 'admin', user_type: 'admin' };
    });

    describe('POST /moderation/user/:id/ban', () => {
        test('bans user successfully', async () => {
            const res = await request(app)
                .post('/moderation/user/123/ban')
                .type('form')
                .send({ banType: '24hBanned' });
            
            expect(UserService.banUser).toHaveBeenCalledWith('123', '24hBanned');
            expect(res.statusCode).toBe(302);
        });
    });

    describe('POST /moderation/comment/:id/delete', () => {
        test('deletes comment successfully', async () => {
            const res = await request(app)
                .post('/moderation/comment/456/delete');
            
            expect(CommentService.deleteComment).toHaveBeenCalledWith('456');
            expect(res.statusCode).toBe(302);
        });
    });

    describe('GET /moderation/comment/:id/edit', () => {
        test('renders edit page', async () => {
            CommentService.getCommentById.mockResolvedValue({ id: 789, content: 'Old Content' });
            const res = await request(app).get('/moderation/comment/789/edit');
            
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Edit Comment');
            expect(res.text).toContain('Old Content');
        });

        test('returns 404 if comment not found', async () => {
             CommentService.getCommentById.mockResolvedValue(null);
             const res = await request(app).get('/moderation/comment/999/edit');
             expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /moderation/comment/:id/edit', () => {
        test('updates comment successfully', async () => {
            const res = await request(app)
                .post('/moderation/comment/789/edit')
                .type('form')
                .send({ content: 'New Content' });
            
            expect(CommentService.updateComment).toHaveBeenCalledWith('789', 'New Content');
            expect(res.statusCode).toBe(302);
        });
    });
});
