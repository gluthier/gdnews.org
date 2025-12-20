const request = require('supertest');

// Mock express-handlebars to avoid template rendering issues
jest.mock('express-handlebars', () => ({
    engine: jest.fn(() => (path, options, callback) => {
        callback(null, `Rendered ${path} with ${JSON.stringify(options)}`);
    })
}));

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
        test('handles pagination', async () => {
             const posts = Array(31).fill({ id: 1, title: 'Post' });
             PostService.getPosts.mockResolvedValue(posts);

             const res = await request(app).get('/post/list');
             expect(res.text).toContain('/post/list?page=2');
        });

        test('handles errors', async () => {
            PostService.getPosts.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app).get('/post/list');
            expect(res.statusCode).toBe(500);
        });
    });

    describe('GET /post/newest', () => {
        test('renders newest posts', async () => {
            PostService.getPosts.mockResolvedValue([
                { id: 3, title: 'Newest Post' }
            ]);

            const res = await request(app).get('/post/newest');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Newest Post');
            expect(res.text).toContain('newest');
        });

        test('handles pagination', async () => {
             const posts = Array(31).fill({ id: 1, title: 'Post' });
             PostService.getPosts.mockResolvedValue(posts);

             const res = await request(app).get('/post/newest');
             expect(res.text).toContain('/post/newest?page=2');
        });

        test('handles errors', async () => {
             PostService.getPosts.mockRejectedValue(new Error('DB Fail'));
             const res = await request(app).get('/post/newest');
             expect(res.statusCode).toBe(500);
        });
    });

    describe('POST /post/submit', () => {
        test('creates a post successfully', async () => {
            PostService.createPost.mockResolvedValue({ insertId: 100 });
            
            const res = await request(app)
                .post('/post/submit')
                .type('form')
                .send({ title: 'New Post', url: 'http://example.com', description: '' });
                
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
            
            const resWithUrl = await request(app)
                .post('/post/submit')
                .type('form')
                .send({ title: '', url: 'http://preserve-me.com' });
            
            expect(resWithUrl.text).toContain('http://preserve-me.com');
        });


        test('fails with invalid URL scheme', async () => {
             const res = await request(app)
                .post('/post/submit')
                .type('form')
                .send({ title: 'Bad Link', url: 'javascript:alert(1)', description: '' });
             
             expect(res.statusCode).toBe(200);
             expect(res.text).toContain('Invalid URL scheme');
        });

        test('fails when service throws error and persists in session', async () => {
            PostService.createPost.mockRejectedValue(new Error('DB Fail'));
            const agent = request.agent(app);

            const res = await agent
                .post('/post/submit')
                .type('form')
                .send({ title: 'PostPersist', url: 'http://persist.com', description: 'TextPersist' });
            
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Submission failed');
            
            // Check if GET /submit loads it
            const getRes = await agent.get('/post/submit');
            expect(getRes.text).toContain('PostPersist');
            expect(getRes.text).toContain('http://persist.com');
            expect(getRes.text).toContain('TextPersist');
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

        test('handles errors', async () => {
            PostService.getPostById.mockRejectedValue(new Error('BD Fail'));
            const res = await request(app).get('/post/item/1');
            expect(res.statusCode).toBe(500);
        });
    });

    describe('GET /post/newest', () => {
        test('renders newest posts', async () => {
            PostService.getPosts.mockResolvedValue([
                { id: 3, title: 'Newest Post' }
            ]);

            const res = await request(app).get('/post/newest');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Newest Post');
            expect(res.text).toContain('newest');
        });
    });

    describe('GET /post/submit', () => {
        test('renders submit form', async () => {
            const res = await request(app).get('/post/submit');
            expect(res.statusCode).toEqual(200);
            // Verify render of pages/post/submit
        });
    });
    
    describe('POST /post/item/:id/comment', () => {
        test('creates a comment and redirects', async () => {
            PostService.addComment.mockResolvedValue({ insertId: 50 });
            
            const res = await request(app)
                .post('/post/item/1/comment')
                .type('form')
                .send({ content: 'Nice post!' });
            
            expect(res.statusCode).toEqual(302);
            expect(PostService.addComment).toHaveBeenCalledWith({
                postId: '1',
                userId: 1,
                content: 'Nice post!',
                parentCommentId: null
            });
        });

        test('returns JSON when requested via AJAX', async () => {
             PostService.addComment.mockResolvedValue({ insertId: 51 });
             
             const res = await request(app)
                .post('/post/item/1/comment')
                .set('Accept', 'application/json')
                .type('form')
                .send({ content: 'JSON Comment' });
            
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('comment.handlebars');
        });



        test('handles errors during JSON comment', async () => {
            PostService.addComment.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app)
                .post('/post/item/1/comment')
                .set('Accept', 'application/json')
                .type('form')
                .send({ content: 'Comment' });
            
            expect(res.statusCode).toBe(500);
        });

        test('redirects on error for regular comment', async () => {
             PostService.addComment.mockRejectedValue(new Error('DB Fail'));
             const res = await request(app)
                .post('/post/item/1/comment')
                .set('Referer', '/post/item/1')
                .type('form')
                .send({ content: 'Comment' });

             expect(res.statusCode).toBe(302);
             expect(res.headers.location).toBe('/post/item/1');
        });
    });

    describe('POST /favorite/:id', () => {
        test('favorites a post', async () => {
            PostService.favorite.mockResolvedValue();
            
            const res = await request(app).post('/post/favorite/1');
            expect(res.statusCode).toEqual(302);
            expect(PostService.favorite).toHaveBeenCalledWith(1, '1');
        });
    });

    describe('POST /unfavorite/:id', () => {
        test('unfavorites a post', async () => {
            PostService.unfavorite.mockResolvedValue();
            
            const res = await request(app).post('/post/unfavorite/1');
            expect(res.statusCode).toEqual(302);
            expect(PostService.unfavorite).toHaveBeenCalledWith(1, '1');
        });

        test('handles errors', async () => {
            PostService.unfavorite.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app).post('/post/unfavorite/1');
            expect(res.statusCode).toBe(500);
        });
    });

    describe('POST /favorite/:id error', () => {
         test('handles errors', async () => {
            PostService.favorite.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app).post('/post/favorite/1');
            expect(res.statusCode).toBe(500);
        });
    });
});
