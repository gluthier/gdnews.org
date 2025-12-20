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
    req.session.user = { id: 1, username: 'testuser', email: 'test@example.com' };
    res.locals.user = req.session.user;
    next();
});

// Mock services
const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn(),
    getPostById: jest.fn(),
    createPost: jest.fn(),
    updatePostStatus: jest.fn(),
    addComment: jest.fn(),
    favorite: jest.fn(),
    unfavorite: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));

jest.mock('csurf', () => () => (req, res, next) => {
    req.csrfToken = () => 'mock-token';
    next();
});

const app = require('../../src/server');

describe('Post Removal Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /post/item/:id/remove', () => {
        test('renders removal page for owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 1, title: 'My Post', is_job: false });
            
            const res = await request(app).get('/post/item/10/remove');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Remove Post');
            expect(res.text).toContain('My Post');
        });

        test('returns 403 for non-owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 2, title: 'Not My Post', is_job: false });
            
            const res = await request(app).get('/post/item/10/remove');
            expect(res.statusCode).toBe(403);
        });

        test('returns 404 for non-existent post', async () => {
            PostService.getPostById.mockResolvedValue(null);
            const res = await request(app).get('/post/item/999/remove');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /post/item/:id/remove', () => {
        test('marks post as removed', async () => {
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 1, title: 'My Post' });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/post/item/10/remove');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('10', 'removed');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/post/list');
        });

        test('returns 403 for non-owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 10, user_id: 2, title: 'Not My Post' });

            const res = await request(app).post('/post/item/10/remove');
            
            expect(PostService.updatePostStatus).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });
    });
});
