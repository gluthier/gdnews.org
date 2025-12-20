const request = require('supertest');

// Mock database to prevent connection attempts
jest.mock('../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Mock PostService
const PostService = require('../src/services/post-service');
jest.mock('../src/services/post-service', () => ({
    getPosts: jest.fn(),
    getPostById: jest.fn()
}));

// Mock CommentService (used in job item routes)
jest.mock('../src/services/comment-service', () => ({
    fetchCommentsForPost: jest.fn().mockResolvedValue([])
}));

// Import app after mocks
const app = require('../src/server');

describe('Public Routes', () => {
    describe('Home Redirect', () => {
        test('GET / redirects to /post/list', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/post/list');
        });
    });

    describe('Job Routes', () => {
        test('GET /job/list renders successfully', async () => {
            PostService.getPosts.mockResolvedValue([
                { id: 1, title: 'Test Job', is_job: true }
            ]);

            const res = await request(app).get('/job/list');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('jobs'); // Title in layout/page
        });
    });

    // Add more route tests here
});
