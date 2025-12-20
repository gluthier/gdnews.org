const request = require('supertest');

// Mock database
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock Stripe
jest.mock('stripe', () => () => ({
    checkout: {
        sessions: {
            create: jest.fn().mockResolvedValue({ url: 'http://stripe.url', id: 'sess_123' }),
            retrieve: jest.fn()
        }
    }
}));

// Mock middleware
jest.mock('../../src/middleware/auth', () => (req, res, next) => {
    req.session = req.session || {};
    req.session.user = { id: 1, username: 'testuser' };
    res.locals.user = req.session.user;
    next();
});

// Mock services
const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn(),
    getPostById: jest.fn(),
    createPost: jest.fn(),
    checkPromotedCollision: jest.fn()
}));

const CommentService = require('../../src/services/comment-service');
jest.mock('../../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));



const app = require('../../src/server');

describe('Promoted Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /promoted/upcoming', () => {
        test('renders upcoming promoted posts', async () => {
            PostService.getPosts.mockResolvedValue([]);
            const res = await request(app).get('/promoted/upcoming');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('upcoming');
        });
    });

    describe('POST /promoted/schedule', () => {
        test('redirects to stripe on success', async () => {
            PostService.checkPromotedCollision.mockResolvedValue(false);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 10);
            const dateStr = futureDate.toISOString().split('T')[0];

            const res = await request(app)
                .post('/promoted/schedule')
                .type('form')
                .send({ 
                    title: 'Promo', 
                    url: 'http://a.com', 
                    text: 'txt', 
                    promoted_date: dateStr, 
                    pricing_tier: 'indie' 
                });

            expect(res.statusCode).toEqual(303);
            expect(res.headers.location).toBe('http://stripe.url');
        });

        test('fails if collision detected', async () => {
            PostService.checkPromotedCollision.mockResolvedValue(true);
             const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 10);
            const dateStr = futureDate.toISOString().split('T')[0];

            const res = await request(app)
                .post('/promoted/schedule')
                .type('form')
                .send({ 
                    title: 'Promo', 
                    url: 'http://a.com', 
                    text: 'txt', 
                    promoted_date: dateStr, 
                    pricing_tier: 'indie' 
                });

            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('already scheduled');
        });
    });
});
