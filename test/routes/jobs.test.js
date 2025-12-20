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
    req.session.user = { id: 1, username: 'testuser' };
    res.locals.user = req.session.user;
    next();
});

// Mock services
const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn(),
    getPostById: jest.fn(),
    createPost: jest.fn()
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

describe('Job Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /job/list', () => {
        test('renders job list', async () => {
            PostService.getPosts.mockResolvedValue([
                { id: 1, title: 'Software Engineer', is_job: true }
            ]);

            const res = await request(app).get('/job/list');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('jobs');
            expect(PostService.getPosts).toHaveBeenCalledWith(expect.objectContaining({ type: 'jobs' }));
        });
    });

    describe('POST /job/submit', () => {
        test('creates a job successfully', async () => {
            PostService.createPost.mockResolvedValue({ insertId: 101 });

            const res = await request(app)
                .post('/job/submit')
                .type('form')
                .send({ title: 'Hiring Dev', text: 'Great job', url: '' });

            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/job/list');
            expect(PostService.createPost).toHaveBeenCalledWith(expect.objectContaining({ isJob: true }));
        });
    });
});
