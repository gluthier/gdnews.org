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


        test('handles pagination', async () => {
             PostService.getPosts.mockResolvedValue([]);
             await request(app).get('/job/list?page=2');
             expect(PostService.getPosts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
        });

        test('sets nextPageUrl when more posts exist', async () => {
             // Mock 31 posts
             const posts = Array(31).fill({ id: 1, title: 'Job', is_job: true });
             PostService.getPosts.mockResolvedValue(posts);

             const res = await request(app).get('/job/list');
             expect(res.text).toContain('/job/list?page&#x3D;2');
        });

        test('handles errors in list route', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            PostService.getPosts.mockRejectedValue(new Error('DB Fail'));
            const res = await request(app).get('/job/list');
            expect(res.statusCode).toBe(500);
            consoleSpy.mockRestore();
        });
    });

    describe('GET /job/submit', () => {
        test('renders submit form', async () => {
            const res = await request(app).get('/job/submit');
            expect(res.statusCode).toBe(200);
        });
    });

    describe('POST /job/submit', () => {
        test('creates a job successfully', async () => {
            PostService.createPost.mockResolvedValue({ insertId: 101 });

            const res = await request(app)
                .post('/job/submit')
                .type('form')
                .send({ title: 'Hiring Dev', description: 'Great job', url: '' });

            expect(res.statusCode).toEqual(302);
            expect(res.headers.location).toBe('/job/list');
            expect(PostService.createPost).toHaveBeenCalledWith(expect.objectContaining({ isJob: true }));
        });

        test('fails when title or text is missing', async () => {
            const res = await request(app)
                .post('/job/submit')
                .type('form')
                .send({ title: '', description: '', url: '' });
            
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Title and Description are required');

            const resWithData = await request(app)
                .post('/job/submit')
                .type('form')
                .send({ title: 'Preserve Title', description: '', url: 'http://preserve.url' });
            
            expect(resWithData.text).toContain('value="Preserve Title"');
            expect(resWithData.text).toContain('value="http://preserve.url"');
        });

        test('fails when service throws error and persists in session', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            PostService.createPost.mockRejectedValue(new Error('Service Error'));
            const agent = request.agent(app);

             const res = await agent
                .post('/job/submit')
                .type('form')
                .send({ title: 'SessTitle', description: 'SessText', url: 'http://sess.com' });

             expect(res.statusCode).toBe(200); 
             expect(res.text).toContain('Service Error');
             
             // Now check if GET /submit loads it from session
             const getRes = await agent.get('/job/submit');
             expect(getRes.text).toContain('SessTitle');
             expect(getRes.text).toContain('http://sess.com');
             expect(getRes.text).toContain('SessText');
             consoleSpy.mockRestore();
        });

        test('displays daily limit error message from service', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const limitError = 'Daily limit reached. You can submit up to 5 jobs per day because your email is not validated.';
            PostService.createPost.mockRejectedValue(new Error(limitError));

            const res = await request(app)
                .post('/job/submit')
                .type('form')
                .send({ title: 'Job Title', description: 'Description', url: '' });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain(limitError);
            consoleSpy.mockRestore();
        });
    });
    
    describe('GET /job/item/:id', () => {
        test('renders job item', async () => {
            PostService.getPostById.mockResolvedValue({ id: 1, title: 'Job 1', is_job: true });
            
            const res = await request(app).get('/job/item/1');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Job 1');
        });

        test('returns 404 if job not found', async () => {
            PostService.getPostById.mockResolvedValue(null);
            
            const res = await request(app).get('/job/item/999');
            expect(res.statusCode).toBe(404);
        });

        test('returns 404 if post is not a job', async () => {
            PostService.getPostById.mockResolvedValue({ id: 2, is_job: false });

            const res = await request(app).get('/job/item/2');
            expect(res.statusCode).toBe(404);
        });

        test('handles errors in item route', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            PostService.getPostById.mockRejectedValue(new Error('DB Error'));
            const res = await request(app).get('/job/item/1');
            expect(res.statusCode).toBe(500);
            consoleSpy.mockRestore();
        });
    });
});
