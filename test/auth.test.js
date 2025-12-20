const request = require('supertest');
const bcrypt = require('bcrypt');
const UserService = require('../src/services/user-service');

// Mocks
jest.mock('../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../src/services/user-service');
jest.mock('bcrypt');

// Also mock PostService because successful login redirects to /post/list which uses it
jest.mock('../src/services/post-service', () => ({
    getPosts: jest.fn().mockResolvedValue([])
}));

const app = require('../src/server');

describe('Authentication Routes', () => {
    let csrfToken;
    let agent;

    beforeEach(async () => {
        jest.clearAllMocks();
        agent = request.agent(app);
        
        // Fetch login page to get CSRF token and set cookie
        const res = await agent.get('/auth/login');
        expect(res.statusCode).toBe(200);
        
        // Extract CSRF token from hidden input
        const match = res.text.match(/name="_csrf" value="([^"]+)"/);
        if (match && match[1]) {
            csrfToken = match[1];
        } else {
            throw new Error('Could not find CSRF token in login page');
        }
    });

    describe('Login', () => {
        test('Fails with invalid credentials', async () => {
            UserService.getUserByUsername.mockResolvedValue({
                id: 1, 
                username: 'testuser', 
                password_hash: 'hashedpassword'
            });
            bcrypt.compare.mockResolvedValue(false);

            const res = await agent
                .post('/auth/login')
                .type('form')
                .send({
                    username: 'testuser',
                    password: 'wrongpassword',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Invalid username or password');
            expect(UserService.getUserByUsername).toHaveBeenCalledWith('testuser');
        });

        test('Succeeds with valid credentials', async () => {
            UserService.getUserByUsername.mockResolvedValue({
                id: 1, 
                username: 'testuser', 
                password_hash: 'hashedpassword'
            });
            bcrypt.compare.mockResolvedValue(true);

            const res = await agent
                .post('/auth/login')
                .type('form')
                .send({
                    username: 'testuser',
                    password: 'password',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/post/list');
        });

        test.skip('Fails with missing CSRF token', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ username: 'testuser', password: 'password' });

            // csurf returns 403 on missing/invalid token
            expect(res.statusCode).toBe(403);
            expect(res.text).toContain('invalid csrf token');
        });
    });

    describe('Registration', () => {
        beforeEach(async () => {
            // Get token from register page just to be safe, though session is shared
             const res = await agent.get('/auth/register');
             const match = res.text.match(/name="_csrf" value="([^"]+)"/);
             csrfToken = match ? match[1] : csrfToken;
        });

        test('Succeeds with valid data', async () => {
            bcrypt.hash.mockResolvedValue('newhashedpassword');
            UserService.createUser.mockResolvedValue(1);

            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'newuser',
                    password: 'password123',
                    email: 'test@example.com',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/auth/login');
            expect(UserService.createUser).toHaveBeenCalled();
        });

        test('Fails with duplicate username', async () => {
            UserService.createUser.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
            bcrypt.hash.mockResolvedValue('hashed');

            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'existinguser',
                    password: 'password',
                    email: 'test@example.com',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Username already exists');
        });

        test('Handles generic errors during registration', async () => {
             UserService.createUser.mockRejectedValue(new Error('DB Error'));
             bcrypt.hash.mockResolvedValue('hashed');

             const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'user', 
                    password: 'pass',
                    _csrf: csrfToken
                });
            
             // Express error handler should catch it
             // In test env, it might print stack trace or return 500
             expect(res.statusCode).toBe(500); 
        });
    });

    describe('Logout', () => {
        test('GET /auth/logout redirects to /post/list', async () => {
            const res = await request(app).get('/auth/logout');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/post/list');
        });

        test('POST /auth/logout redirects to /post/list', async () => {
            const res = await request(app).post('/auth/logout');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/post/list');
        });
    });
});
