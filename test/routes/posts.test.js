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
    createPost: jest.fn(),
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

describe('Post Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /post/list', () => {
        test('renders list of posts', async () => {
            PostService.getPosts.mockResolvedValue([
                { id: 1, title: 'Test Post' },
                { id: 2, title: 'Another Post' }
            ]);

            const res = await request(app).get('/post/list');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Test Post');
        });
    });

    describe('POST /post/submit', () => {
        test('creates a post successfully', async () => {
            PostService.createPost.mockResolvedValue({ insertId: 100 });
            
            const res = await request(app)
                .post('/post/submit')
                .type('form')
                .send({ title: 'New Post', url: 'http://example.com', text: '' });
                
            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/post/list');
            expect(PostService.createPost).toHaveBeenCalled();
        });

        test('fails with invalid title', async () => {
            const res = await request(app)
                .post('/post/submit')
                .type('form')
                .send({ title: '', url: 'http://example.com' });
                
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Title is required');
        });
    });
    
    describe('GET /post/item/:id', () => {
        test('renders post item', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, title: 'Detail Post' });
            
            const res = await request(app).get('/post/item/1');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Detail Post');
        });

        test('returns 404 if post not found', async () => {
            PostService.getPostById.mockResolvedValue(null);
            
            const res = await request(app).get('/post/item/999');
            expect(res.statusCode).toEqual(404);
        });
    });
});
