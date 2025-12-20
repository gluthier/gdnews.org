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
    updateUserEmail: jest.fn()
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
    });

    describe('POST /user/change-email', () => {
        test('updates email successfully', async () => {
            const res = await request(app)
                .post('/user/change-email')
                .type('form')
                .send({ email: 'new@example.com' });

            expect(res.statusCode).toEqual(302);
            expect(UserService.updateUserEmail).toHaveBeenCalledWith(1, 'new@example.com');
        });
    });
});
