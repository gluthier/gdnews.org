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
    updatePostStatus: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));

// Mock Stripe
const mockStripeSession = { url: 'https://stripe.com/checkout/mock' };
const mockStripe = {
    checkout: {
        sessions: {
            create: jest.fn().mockResolvedValue(mockStripeSession),
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

describe('Job Removal Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /job/item/:id/remove', () => {
        test('renders removal page for owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, user_id: 1, title: 'Job 1', is_job: true });
            
            const res = await request(app).get('/job/item/1/remove');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Remove Job Offer');
            expect(res.text).toContain('Job 1');
        });

        test('returns 403 for non-owner', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, user_id: 2, title: 'Job 1', is_job: true });
            
            const res = await request(app).get('/job/item/1/remove');
            expect(res.statusCode).toBe(403);
        });

        test('returns 404 for non-existent job', async () => {
            PostService.getPostById.mockResolvedValue(null);
            const res = await request(app).get('/job/item/1/remove');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /job/item/:id/remove/unsuccessful', () => {
        test('marks job as removed', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, user_id: 1, is_job: true });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).post('/job/item/1/remove/unsuccessful');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('1', 'removed');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/job/list');
        });
    });

    describe('POST /job/item/:id/remove/successful', () => {
        test('redirects to Stripe Checkout', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, user_id: 1, title: 'Job 1', is_job: true });
            
            const res = await request(app).post('/job/item/1/remove/successful');
            
            expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
            expect(res.statusCode).toBe(303);
            expect(res.headers.location).toBe(mockStripeSession.url);
        });
    });

    describe('GET /job/remove/success', () => {
        test('marks job as filled on successful payment', async () => {
            mockStripe.checkout.sessions.retrieve.mockResolvedValue({ payment_status: 'paid' });
            PostService.updatePostStatus.mockResolvedValue({ affectedRows: 1 });

            const res = await request(app).get('/job/remove/success?session_id=sess_123&job_id=1');
            
            expect(PostService.updatePostStatus).toHaveBeenCalledWith('1', 'filled');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/job/item/1?success=true');
        });
    });
});
