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
    checkPromotedCollision: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));

const mockStripe = {
    checkout: {
        sessions: {
            create: jest.fn(),
            retrieve: jest.fn()
        }
    }
};
jest.mock('stripe', () => () => mockStripe);

jest.mock('csurf', () => () => (req, res, next) => {
    req.csrfToken = () => 'mock-token';
    next();
});

const app = require('../../src/server');

describe('Promoted Post Removal Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /promoted/item/:id/remove', () => {
        test('renders removal page for owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 20, user_id: 1, title: 'My Promoted Post', is_promoted: true });
            
            const res = await request(app).get('/promoted/item/20/remove');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Remove Promoted Post');
            expect(res.text).toContain('My Promoted Post');
        });

        test('returns 403 for non-owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 20, user_id: 2, title: 'Not My Post', is_promoted: true });
            
            const res = await request(app).get('/promoted/item/20/remove');
            expect(res.statusCode).toBe(403);
        });

        test('returns 404 for non-existent promoted post', async () => {
            PostService.getPostById.mockResolvedValue(null);
            const res = await request(app).get('/promoted/item/999/remove');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /promoted/item/:id/remove', () => {
        test('marks promoted post as removed', async () => {
            PostService.getPostById.mockResolvedValue({ id: 20, user_id: 1, title: 'My Promoted Post', is_promoted: true });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/promoted/item/20/remove');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('20', 'removed');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/promoted/upcoming');
        });

        test('returns 403 for non-owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 20, user_id: 2, title: 'Not My Post', is_promoted: true });

            const res = await request(app).post('/promoted/item/20/remove');
            
            expect(PostService.updatePostStatus).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });
    });
});
