const request = require('supertest');
const UserService = require('../../src/services/user-service');

// Mocks
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/services/user-service');
jest.mock('../../src/services/email-service');

const app = require('../../src/server');

describe('Auth Routes - Password Reset', () => {
    let csrfToken;
    let agent;

    beforeEach(async () => {
        jest.clearAllMocks();
        agent = request.agent(app);
        
        // Fetch forgot password page to get CSRF token
        const res = await agent.get('/auth/forgot-password');
        expect(res.statusCode).toBe(200);
        
        const match = res.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match ? match[1] : null;
    });

    describe('GET /auth/forgot-password', () => {
        it('should render forgot password page', async () => {
            const res = await agent.get('/auth/forgot-password');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('forgot password');
        });
    });

    describe('POST /auth/forgot-password', () => {
        it('should always show success message', async () => {
            UserService.initiatePasswordReset.mockResolvedValue('token');

            const res = await agent
                .post('/auth/forgot-password')
                .type('form')
                .send({
                    email: 'test@example.com',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('A password reset link has been sent to your email');
            expect(UserService.initiatePasswordReset).toHaveBeenCalledWith('test@example.com');
        });
    });

    describe('GET /auth/reset-password', () => {
        it('should render reset form for valid token', async () => {
            UserService.verifyResetToken.mockResolvedValue({ id: 1, token: 'valid_token' });

            const res = await agent.get('/auth/reset-password?token=valid_token');

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('reset password');
            expect(res.text).toContain('name="token" value="valid_token"');
        });

        it('should redirect if token is invalid', async () => {
            UserService.verifyResetToken.mockResolvedValue(null);

            const res = await agent.get('/auth/reset-password?token=invalid_token');

            expect(res.statusCode).toBe(200); // Renders login with error
            expect(res.text).toContain('Invalid or expired reset token');
        });
    });

    describe('POST /auth/reset-password', () => {
        it('should reset password when data is valid', async () => {
            UserService.resetPassword.mockResolvedValue();

            const res = await agent
                .post('/auth/reset-password')
                .type('form')
                .send({
                    token: 'valid_token',
                    password: 'newPassword123',
                    confirm_password: 'newPassword123',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200); // Renders login with success
            expect(res.text).toContain('Password reset successful');
            expect(UserService.resetPassword).toHaveBeenCalledWith('valid_token', 'newPassword123');
        });

        it('should show error if passwords do not match', async () => {
            const res = await agent
                .post('/auth/reset-password')
                .type('form')
                .send({
                    token: 'valid_token',
                    password: 'pass1',
                    confirm_password: 'pass2',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Passwords do not match');
            expect(UserService.resetPassword).not.toHaveBeenCalled();
        });

        it('should show error if reset fails (e.g. expired token)', async () => {
            UserService.resetPassword.mockRejectedValue(new Error('Expired'));

            const res = await agent
                .post('/auth/reset-password')
                .type('form')
                .send({
                    token: 'expired_token',
                    password: 'password123',
                    confirm_password: 'password123',
                    _csrf: csrfToken
                });

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('Failed to reset password. The link may have expired.');
        });
    });
});
