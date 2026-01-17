const request = require('supertest');

// Mock database
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock middleware
jest.mock('../../src/middleware/auth', () => (req, res, next) => {
    req.session = req.session || {};
    req.session.user = global.testUser || { id: 1, username: 'testuser', user_type: 'normal' };
    res.locals.user = req.session.user;
    next();
});

// Mock services
const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPostById: jest.fn(),
    updatePostStatus: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    getCommentById: jest.fn(),
    deleteComment: jest.fn()
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

describe('Admin Bypass Deletion Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.testUser = { id: 1, username: 'normal_user', user_type: 'normal' };
    });

    describe('POST /post/item/:id/delete', () => {
        test('Admin can delete post NOT owned by them', async () => {
            global.testUser = { id: 999, username: 'admin_user', user_type: 'admin' };
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 1, title: 'User Post' });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/post/item/10/delete');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('10', 'removed');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/');
        });

        test('Normal user CANNOT delete post NOT owned by them', async () => {
            global.testUser = { id: 2, username: 'normal_user', user_type: 'normal' };
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 1, title: 'User Post' });

            const res = await request(app).post('/post/item/10/delete');
            
            expect(PostService.updatePostStatus).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });

        test('Owner can delete their own post', async () => {
            global.testUser = { id: 1, username: 'owner_user', user_type: 'normal' };
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 1, title: 'My Post' });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/post/item/10/delete');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('10', 'removed');
            expect(res.statusCode).toBe(302);
        });
    });

    describe('POST /post/item/:id/comment/:commentId/remove', () => {
        test('Admin can delete comment NOT owned by them', async () => {
            global.testUser = { id: 999, username: 'admin_user', user_type: 'admin' };
            CommentService.getCommentById.mockResolvedValue({ id: 50, user_id: 1, content: 'User Comment' });
            CommentService.deleteComment.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/post/item/10/comment/50/remove');
            
            expect(CommentService.deleteComment).toHaveBeenCalledWith('50');
            expect(res.statusCode).toBe(302);
        });

        test('Normal user CANNOT delete comment NOT owned by them', async () => {
            global.testUser = { id: 2, username: 'normal_user', user_type: 'normal' };
            CommentService.getCommentById.mockResolvedValue({ id: 50, user_id: 1, content: 'User Comment' });

            const res = await request(app).post('/post/item/10/comment/50/remove');
            
            expect(CommentService.deleteComment).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });

        test('Owner can delete their own comment', async () => {
            global.testUser = { id: 1, username: 'owner_user', user_type: 'normal' };
            CommentService.getCommentById.mockResolvedValue({ id: 50, user_id: 1, content: 'My Comment' });
            CommentService.deleteComment.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/post/item/10/comment/50/remove');
            
            expect(CommentService.deleteComment).toHaveBeenCalledWith('50');
            expect(res.statusCode).toBe(302);
        });
    });
});
