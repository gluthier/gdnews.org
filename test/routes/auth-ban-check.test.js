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

describe('Auth - Ban Check on Login', () => {
    let csrfToken;
    let agent;

    beforeEach(async () => {
        jest.clearAllMocks();
        agent = request.agent(app);
        
        // Fetch login page to get CSRF token
        const res = await agent.get('/auth/login');
        const match = res.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match ? match[1] : '';
    });

    const mockUser = {
        id: 123,
        username: 'banneduser',
        password_hash: 'hashedPassword',
        email: 'test@example.com',
        user_type: 'normal'
    };

    test('Login succeeds if user is NOT banned', async () => {
        UserService.getUserByUsername.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(true);
        UserService.checkBanStatus.mockResolvedValue(null); // No ban

        const res = await agent
            .post('/auth/login')
            .type('form')
            .send({
                username: 'banneduser',
                password: 'password',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
        expect(UserService.checkBanStatus).toHaveBeenCalledWith(mockUser);
    });

    test('Login FAILS if user is actively banned (LifeBanned)', async () => {
        UserService.getUserByUsername.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(true);
        UserService.checkBanStatus.mockResolvedValue({
            type: 'LifeBanned',
            reason: 'Lifetime Ban',
            until: null
        });

        const res = await agent
            .post('/auth/login')
            .type('form')
            .send({
                username: 'banneduser',
                password: 'password',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Your account has been permanently banned');
        expect(UserService.checkBanStatus).toHaveBeenCalledWith(mockUser);
        // Ensure NO session is created (cannot easily check req.session here, but successful redirect implies session)
        // Since we got 200 and error text, we know we didn't redirect.
    });

    test('Login FAILS if user is actively banned (Timed Ban)', async () => {
        UserService.getUserByUsername.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(true);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);
        
        UserService.checkBanStatus.mockResolvedValue({
            type: '24hBanned',
            reason: '24 Hour Ban',
            until: futureDate
        });

        const res = await agent
            .post('/auth/login')
            .type('form')
            .send({
                username: 'banneduser',
                password: 'password',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Your account has been banned until');
        expect(res.text).toContain(futureDate.toLocaleString());
        expect(UserService.checkBanStatus).toHaveBeenCalledWith(mockUser);
    });

    test('Login SUCCEEDS if ban has expired (checkBanStatus performs unban update internally and returns null)', async () => {
        UserService.getUserByUsername.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(true);
        
        // UserService.checkBanStatus logic dictates that if expired, it updates DB and returns null.
        // We simulate this by having the mock return null, representing "no active ban".
        UserService.checkBanStatus.mockResolvedValue(null); 

        const res = await agent
            .post('/auth/login')
            .type('form')
            .send({
                username: 'banneduser',
                password: 'password',
                _csrf: csrfToken
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
        expect(UserService.checkBanStatus).toHaveBeenCalledWith(mockUser);
    });
});
