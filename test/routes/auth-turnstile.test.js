const request = require('supertest');
const bcrypt = require('bcrypt');
const UserService = require('../../src/services/user-service');

// Mocks
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/services/user-service');
jest.mock('bcrypt');
// Mock PostService
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn().mockResolvedValue([])
}));

const app = require('../../src/server');

describe('Authentication Routes - Turnstile', () => {
    let csrfToken;
    let agent;
    const originalEnv = process.env;

    beforeEach(async () => {
        jest.clearAllMocks();
        process.env = { ...originalEnv }; // Reset env vars
        agent = request.agent(app);
        
        // Fetch login page to get CSRF token
        const res = await agent.get('/auth/login');
        const match = res.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match ? match[1] : '';

        // Mock global fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        process.env = originalEnv; // Restore env vars
        jest.restoreAllMocks();
    });

    test('Registration fails when Turnstile is enabled but token is missing', async () => {
        process.env.TURNSTILE_SITE_KEY = 'test-site-key';
        process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'newuser',
                password: 'password123',
                email: 'test@example.com',
                _csrf: csrfToken
                // Missing cf-turnstile-response
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Please complete the security check');
        expect(UserService.createUser).not.toHaveBeenCalled();
    });

    test('Registration fails when Turnstile verification fails', async () => {
        process.env.TURNSTILE_SITE_KEY = 'test-site-key';
        process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ success: false })
        });

        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'newuser',
                password: 'password123',
                email: 'test@example.com',
                _csrf: csrfToken,
                'cf-turnstile-response': 'invalid-token'
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Security check failed');
        expect(UserService.createUser).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(URLSearchParams)
            })
        );
    });

    test('Registration succeeds when Turnstile verification passes', async () => {
        process.env.TURNSTILE_SITE_KEY = 'test-site-key';
        process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ success: true })
        });

        // Mock successful user creation
        bcrypt.hash.mockResolvedValue('hashedpassword');
        UserService.createUser.mockResolvedValue(1);

        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'newuser',
                password: 'password123',
                email: 'test@example.com',
                _csrf: csrfToken,
                'cf-turnstile-response': 'valid-token'
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Registration successful');
        expect(UserService.createUser).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalled();
    });

    test('Registration handles Turnstile API errors', async () => {
        process.env.TURNSTILE_SITE_KEY = 'test-site-key';
        process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

        global.fetch.mockRejectedValue(new Error('Network error'));

        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'newuser',
                password: 'password123',
                email: 'test@example.com',
                _csrf: csrfToken,
                'cf-turnstile-response': 'valid-token'
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Security check error');
        expect(UserService.createUser).not.toHaveBeenCalled();
    });
});
