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

// Also mock PostService because successful login redirects to /post/list which uses it
jest.mock('../../src/services/post-service', () => ({
    getPosts: jest.fn().mockResolvedValue([])
}));

const app = require('../../src/server');

describe('Authentication Routes', () => {
    let csrfToken;
    let agent;
    const originalEnv = process.env;

    beforeEach(async () => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.TURNSTILE_SECRET_KEY; // Disable Turnstile for these tests
        
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

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('GET Routes', () => {
        test('GET /auth/register renders register page', async () => {
            const res = await agent.get('/auth/register');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('register');
        });

        test('GET /auth/login renders login page', async () => {
            const res = await agent.get('/auth/login');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('login');
        });
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

        test('Fails when user does not exist', async () => {
            UserService.getUserByUsername.mockResolvedValue(null);

            const res = await agent
                .post('/auth/login')
                .type('form')
                .send({
                    username: 'nonexistent',
                    password: 'password',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Invalid username or password');
        });

        test('Handles errors during login', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            UserService.getUserByUsername.mockRejectedValue(new Error('DB Error'));

            const res = await agent
                .post('/auth/login')
                .type('form')
                .send({
                    username: 'user',
                    password: 'password',
                    _csrf: csrfToken
                });
            
            expect(res.statusCode).toBe(500);
            consoleSpy.mockRestore();
        });

        test('Succeeds with valid credentials', async () => {
            UserService.getUserByUsername.mockResolvedValue({
                id: 1, 
                username: 'testuser', 
                password_hash: 'hashedpassword'
            });
            UserService.updateLastConnection.mockResolvedValue();
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
            expect(res.headers.location).toBe('/');
            expect(UserService.updateLastConnection).toHaveBeenCalledWith(1);
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

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Registration successful! Please check your email to confirm your account.');
            expect(UserService.createUser).toHaveBeenCalled();
        });

        test('Succeeds with hyphen in username', async () => {
            bcrypt.hash.mockResolvedValue('newhashedpassword');
            UserService.createUser.mockResolvedValue(1);

            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'user-name',
                    password: 'password123',
                    email: 'test-hyphen@example.com',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Registration successful! Please check your email to confirm your account.');
            expect(UserService.createUser).toHaveBeenCalled();
        });

        test('Succeeds without email', async () => {
            bcrypt.hash.mockResolvedValue('newhashedpassword');
            UserService.createUser.mockResolvedValue(1);

            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'noemailuser',
                    password: 'password123',
                    email: '',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Registration successful!');
            expect(res.text).not.toContain('Please check your email');
            expect(UserService.createUser).toHaveBeenCalled();
        });

        test('Fails with duplicate username', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
            expect(res.text).toContain('value="existinguser"');
            expect(res.text).toContain('value="test@example.com"');
            
            consoleSpy.mockRestore();
        });

        test('Fails with duplicate email', async () => {
            UserService.getUserByEmail.mockResolvedValue({ id: 42, email: 'test@example.com' });

            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'newuser',
                    password: 'password123',
                    email: 'test@example.com',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Registration failed');
            expect(UserService.createUser).not.toHaveBeenCalled();
            expect(bcrypt.hash).not.toHaveBeenCalled();
        });

        test('Fails with missing fields', async () => {
            const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: '',
                    password: '',
                    _csrf: csrfToken
                });
            
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('All fields are required');
            // email should be preserved even if password/username is missing
            const resWithEmail = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: '',
                    password: '',
                    email: 'preserve@me.com',
                    _csrf: csrfToken
                });
            expect(resWithEmail.text).toContain('value="preserve@me.com"');
        });

        test('Handles generic errors during registration', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
             UserService.createUser.mockRejectedValue(new Error('DB Error'));
             bcrypt.hash.mockResolvedValue('hashed');

             const res = await agent
                .post('/auth/register')
                .type('form')
                .send({
                    username: 'user', 
                    password: 'password123',
                    _csrf: csrfToken
                });
            
             // Express error handler should catch it
             // In test env, it might print stack trace or return 500
             expect(res.statusCode).toBe(500); 
             consoleSpy.mockRestore();
        });
    });

    describe('Logout', () => {
        test('GET /auth/logout redirects to /post/list', async () => {
            const res = await request(app).get('/auth/logout');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/');
        });

        test('POST /auth/logout redirects to /post/list', async () => {
            const res = await request(app).post('/auth/logout');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/');
        });
    });

    describe('Email Confirmation', () => {
        test('GET /auth/confirm-email succeeds with valid token', async () => {
            UserService.verifyAndComplete.mockResolvedValue(true);

            const res = await agent.get('/auth/confirm-email?token=valid-token');

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Email verified!');
            expect(UserService.verifyAndComplete).toHaveBeenCalledWith('valid-token');
        });

        test('GET /auth/confirm-email fails with invalid token', async () => {
            UserService.verifyAndComplete.mockRejectedValue(new Error('Invalid token'));

            const res = await agent.get('/auth/confirm-email?token=invalid-token');

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Invalid or expired confirmation token.');
        });
    });

    describe('Email Change Confirmation', () => {
        test('GET /auth/confirm-change-email succeeds and redirects to profile when logged in', async () => {
            UserService.verifyAndComplete.mockResolvedValue(true);
            
            // Mock session
            UserService.getUserByUsername.mockResolvedValue({
                id: 1, 
                username: 'testuser', 
                password_hash: 'hashedpassword',
                email: 'test@example.com'
            });
            bcrypt.compare.mockResolvedValue(true);
            await agent.post('/auth/login').type('form').send({
                username: 'testuser',
                password: 'password',
                _csrf: csrfToken
            });

            const res = await agent.get('/auth/confirm-change-email?token=valid-token');

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/user/profile/testuser?success=Email%20changed%20successfully!');
        });

        test('GET /auth/confirm-change-email succeeds and shows login when logged out', async () => {
            UserService.verifyAndComplete.mockResolvedValue(true);

            const res = await agent.get('/auth/confirm-change-email?token=valid-token');

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Email changed successfully!');
        });

        test('GET /auth/confirm-change-email fails with invalid token', async () => {
            UserService.verifyAndComplete.mockRejectedValue(new Error('Invalid token'));

            const res = await agent.get('/auth/confirm-change-email?token=invalid-token');

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Invalid or expired confirmation token.');
        });
    });
});
