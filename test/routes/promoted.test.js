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
        test('handles pagination', async () => {
             const posts = Array(31).fill({ id: 1, title: 'Promo' });
             PostService.getPosts.mockResolvedValue(posts);

             const res = await request(app).get('/promoted/upcoming');
             expect(res.text).toContain('/promoted/upcoming?page&#x3D;2');
        });

        test('handles errors', async () => {
            PostService.getPosts.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app).get('/promoted/upcoming');
            expect(res.statusCode).toBe(500);
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
                    description: 'txt', 
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
                    description: 'txt', 
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

        test('repopulates from session data after cancellation', async () => {
            const agent = request.agent(app);
            
            // 1. Submit form to trigger session storage
            PostService.checkPromotedCollision.mockResolvedValue(false);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 10);
            const dateStr = futureDate.toISOString().split('T')[0];

            await agent
                .post('/promoted/schedule')
                .type('form')
                .send({ 
                    title: 'Persistent Title', 
                    url: 'http://persistent.com', 
                    description: 'Persistent Text', 
                    promoted_date: dateStr, 
                    pricing_tier: 'indie' 
                });

            // 2. Go to cancel (which redirects back to schedule)
            const cancelRes = await agent.get('/promoted/cancel');
            expect(cancelRes.statusCode).toEqual(302);
            expect(cancelRes.headers.location).toBe('/promoted/schedule?error=cancelled');

            // 3. Check the schedule page via the agent (session should still have data)
            const scheduleRes = await agent.get('/promoted/schedule?error=cancelled');
            expect(scheduleRes.statusCode).toEqual(200);
            expect(scheduleRes.text).toContain('Persistent Title');
            expect(scheduleRes.text).toContain('http://persistent.com');
            expect(scheduleRes.text).toContain('Persistent Text');
            expect(scheduleRes.text).toContain(dateStr);
            expect(scheduleRes.text).toContain('data-value="indie"');
            expect(scheduleRes.text).toContain('Payment cancelled.');
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
                    description: 'promo text',
                    promoted_date: '2025-01-01',
                    pricing_tier: 'mid'
                }
            });
            PostService.checkPromotedCollision.mockResolvedValue(false);
            PostService.createPost.mockResolvedValue({ insertId: 200 });

            const res = await request(app).get('/promoted/success?session_id=sess_123');
            
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/promoted/item/200?success=true');
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
        test('redirects to schedule with error param', async () => {
            const res = await request(app).get('/promoted/cancel');
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/promoted/schedule?error=cancelled');
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
            expect(res.text).not.toContain('Success!');
        });

        test('renders success message when query param present', async () => {
            PostService.getPostById.mockResolvedValue({ 
                id: 10, 
                title: 'Promoted Item', 
                is_promoted: 1 
            });
            
            const res = await request(app).get('/promoted/item/10?success=true');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Success!');
            expect(res.text).toContain('/promoted/upcoming');
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
