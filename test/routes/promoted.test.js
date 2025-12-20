const request = require('supertest');

// Mock database
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock Stripe
const mockStripeSessions = {
    create: jest.fn().mockResolvedValue({ url: 'http://stripe.url', id: 'sess_123' }),
    retrieve: jest.fn()
};

jest.mock('stripe', () => () => ({
    checkout: {
        sessions: mockStripeSessions
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

    describe('GET /promoted/schedule', () => {
        test('renders schedule form', async () => {
            const res = await request(app).get('/promoted/schedule');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('schedule');
        });
    });

    describe('GET /promoted/success', () => {
        test('redirects to schedule if no session_id', async () => {
            const res = await request(app).get('/promoted/success');
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/promoted/schedule');
        });

        test('creates post and redirects on successful payment', async () => {
            mockStripeSessions.retrieve.mockResolvedValue({
                payment_status: 'paid',
                metadata: {
                    user_id: 1,
                    title: 'New Promo',
                    url: 'http://b.com',
                    text: 'promo text',
                    promoted_date: '2025-01-01',
                    pricing_tier: 'mid'
                }
            });
            PostService.checkPromotedCollision.mockResolvedValue(false);
            PostService.createPost.mockResolvedValue({ insertId: 200 });

            const res = await request(app).get('/promoted/success?session_id=sess_123');
            
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/promoted/upcoming');
            expect(PostService.createPost).toHaveBeenCalled();
        });

        test('handles payment not successful', async () => {
            mockStripeSessions.retrieve.mockResolvedValue({
                payment_status: 'unpaid'
            });

            const res = await request(app).get('/promoted/success?session_id=sess_fail');
            
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Payment was not successful');
        });

         test('handles collision during final check', async () => {
            mockStripeSessions.retrieve.mockResolvedValue({
                payment_status: 'paid',
                metadata: {
                    user_id: 1,
                    title: 'New Promo',
                    promoted_date: '2025-01-01'
                }
            });
            PostService.checkPromotedCollision.mockResolvedValue(true);

            const res = await request(app).get('/promoted/success?session_id=sess_collision');
            
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Slot was taken');
        });
    });

    describe('GET /promoted/cancel', () => {
        test('renders cancel message', async () => {
            const res = await request(app).get('/promoted/cancel');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Payment cancelled');
        });
    });

    describe('GET /promoted/item/:id', () => {
        test('renders promoted post item', async () => {
            PostService.getPostById.mockResolvedValue({ 
                id: 10, 
                title: 'Promoted Item', 
                is_promoted: 1 
            });
            
            const res = await request(app).get('/promoted/item/10');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Promoted Item');
        });

        test('returns 404 if post not promoted', async () => {
            PostService.getPostById.mockResolvedValue({ 
                id: 11, 
                title: 'Regular Item', 
                is_promoted: 0 
            });
            
            const res = await request(app).get('/promoted/item/11');
            expect(res.statusCode).toEqual(404);
        });

        test('returns 404 if post not found', async () => {
            PostService.getPostById.mockResolvedValue(null);
            
            const res = await request(app).get('/promoted/item/999');
            expect(res.statusCode).toEqual(404);
        });
    });
});
