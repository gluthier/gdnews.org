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
const UserService = require('../../src/services/user-service');
jest.mock('../../src/services/user-service', () => ({
    getUserByUsername: jest.fn(),
    updateUserEmail: jest.fn(),
    initiateEmailConfirmation: jest.fn()
}));

const PostService = require('../../src/services/post-service');
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn()
}));

jest.mock('csurf', () => () => (req, res, next) => {
    req.csrfToken = () => 'mock-token';
    next();
});

jest.mock('express-session', () => {
    return () => (req, res, next) => {
        req.session = { user: { id: 1, username: 'testuser' } };
        next();
    };
});

const app = require('../../src/server');

describe('User Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /user/profile/:username', () => {
        test('renders user profile', async () => {
            UserService.getUserByUsername.mockResolvedValue({ id: 2, username: 'otheruser', created_at: new Date() });
            PostService.getPosts.mockResolvedValue([]);

            const res = await request(app).get('/user/profile/otheruser');
            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('otheruser');
        });

        test('returns 404 if user not found', async () => {
            UserService.getUserByUsername.mockResolvedValue(null);

            const res = await request(app).get('/user/profile/nobody');
            expect(res.statusCode).toEqual(404);
        });
    
        test('handles pagination and tabs', async () => {
             UserService.getUserByUsername.mockResolvedValue({ id: 1, username: 'testuser' });
             PostService.getPosts.mockResolvedValue([]);

             const res = await request(app).get('/user/profile/testuser?page=2&tab=favorites');
             expect(res.statusCode).toBe(200);
             expect(PostService.getPosts).toHaveBeenCalledWith(expect.objectContaining({ 
                 page: 2, 
                 type: 'user_favorites' 
             }));
        });
        
        test('redirects if user is not authorized for favorites', async () => {
             UserService.getUserByUsername.mockResolvedValue({ id: 2, username: 'otheruser' });
             
             const res = await request(app).get('/user/profile/otheruser?tab=favorites');
             expect(res.statusCode).toBe(302);
             expect(res.headers.location).toBe('/user/profile/otheruser');
        });
        test('handles errors', async () => {
             const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
             UserService.getUserByUsername.mockRejectedValue(new Error('DB Fail'));
             const res = await request(app).get('/user/profile/testuser');
             expect(res.statusCode).toBe(500);
             consoleSpy.mockRestore();
        });
    });

    describe('GET /user/profile', () => {
        test('redirects to specific profile if id query param exists', async () => {
             const res = await request(app).get('/user/profile?id=someuser');
             expect(res.statusCode).toBe(302);
             expect(res.headers.location).toBe('/user/profile/someuser');
        });

        test('redirects to post list if no id', async () => {
             const res = await request(app).get('/user/profile');
             expect(res.statusCode).toBe(302);
             expect(res.headers.location).toBe('/post/list');
        });
    });

    describe('GET /user/change-email', () => {
        test('renders change email page', async () => {
            const res = await request(app).get('/user/change-email');
            expect(res.statusCode).toBe(200);
        });
    });

    describe('POST /user/change-email', () => {
        test('updates email successfully', async () => {
            const res = await request(app)
                .post('/user/change-email')
                .type('form')
                .send({ email: 'new@example.com' });

            expect(res.statusCode).toEqual(200);
            expect(res.text).toContain('Confirmation email sent');
            expect(UserService.initiateEmailConfirmation).toHaveBeenCalledWith(1, 'new@example.com', 'CHANGE_EMAIL');
        });
    });
});
