const request = require('supertest');
const UserService = require('../../src/services/user-service');

// Mocks
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/services/user-service');
jest.mock('bcrypt');

const app = require('../../src/server');

describe('Username Validation', () => {
    let csrfToken;
    let agent;

    beforeEach(async () => {
        jest.clearAllMocks();
        agent = request.agent(app);
        
        // Fetch register page to get CSRF token
        const res = await agent.get('/auth/register');
        const match = res.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match[1];
    });

    test('Fails when username is too short (< 3 chars)', async () => {
        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'a'.repeat(2),
                password: 'password123',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Username must be at least 3 characters long');
    });ß

    test('Fails when username is too long (> 24 chars)', async () => {
        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'a'.repeat(25),
                password: 'password123',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Username must be at most 24 characters long');
    });

    test('Fails when username contains spaces', async () => {
        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'user name',
                password: 'password123',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Username can only contain letters, numbers, and underscores');
    });

    test('Fails when username contains special characters', async () => {
        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: 'user@name!',
                password: 'password123',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Username can only contain letters, numbers, and underscores');
    });

    test('Succeeds with 24 characters and underscores', async () => {
        const validUsername = 'user_name_12345678901234'; // 24 chars
        UserService.createUser.mockResolvedValue(1);

        const res = await agent
            .post('/auth/register')
            .type('form')
            .send({
                username: validUsername,
                password: 'password123',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Registration successful');
    });
});
