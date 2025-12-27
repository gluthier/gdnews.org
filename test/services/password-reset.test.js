const UserService = require('../../src/services/user-service');
const database = require('../../src/database/database');
const EmailService = require('../../src/services/email-service');
const bcrypt = require('bcrypt');

jest.mock('../../src/database/database');
jest.mock('../../src/services/email-service');
jest.mock('bcrypt');

describe('UserService - Password Reset', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initiatePasswordReset', () => {
        it('should initiate reset if user exists', async () => {
            const email = 'test@example.com';
            database.query.mockResolvedValueOnce([{ id: 1 }]); // User check
            database.query.mockResolvedValueOnce({ insertId: 100 }); // Insert confirmation

            const token = await UserService.initiatePasswordReset(email);

            expect(token).toBeDefined();
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM users WHERE email = ?'),
                [email]
            );
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO email_confirmations'),
                expect.arrayContaining([1, email, token, 'PASSWORD_RESET'])
            );
            expect(EmailService.sendPasswordResetEmail).toHaveBeenCalledWith(email, token);
        });

        it('should do nothing if user does not exist', async () => {
            const email = 'nonexistent@example.com';
            database.query.mockResolvedValueOnce([]); // User check

            const result = await UserService.initiatePasswordReset(email);

            expect(result).toBeUndefined();
            expect(database.query).toHaveBeenCalledTimes(1);
            expect(EmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        });
    });

    describe('verifyResetToken', () => {
        it('should return request if token is valid', async () => {
            const mockRequest = { id: 1, user_id: 10, token: 'valid_token' };
            database.query.mockResolvedValueOnce([mockRequest]);

            const result = await UserService.verifyResetToken('valid_token');

            expect(result).toEqual(mockRequest);
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM email_confirmations WHERE token = ? AND type = "PASSWORD_RESET"'),
                ['valid_token']
            );
        });

        it('should return null if token is invalid or expired', async () => {
            database.query.mockResolvedValueOnce([]);

            const result = await UserService.verifyResetToken('invalid_token');

            expect(result).toBeNull();
        });
    });

    describe('resetPassword', () => {
        it('should update password and delete token', async () => {
            const token = 'valid_token';
            const newPassword = 'newPassword123';
            const mockRequest = { id: 100, user_id: 1 };

            // Mock verifyResetToken (called internally)
            database.query.mockResolvedValueOnce([mockRequest]); 
            bcrypt.hash.mockResolvedValue('hashed_password');
            database.query.mockResolvedValueOnce({ affectedRows: 1 }); // User update
            database.query.mockResolvedValueOnce({ affectedRows: 1 }); // Token delete

            await UserService.resetPassword(token, newPassword);

            expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET password_hash = ? WHERE id = ?'),
                ['hashed_password', 1]
            );
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM email_confirmations WHERE id = ?'),
                [100]
            );
        });

        it('should throw error if token is invalid', async () => {
            database.query.mockResolvedValueOnce([]); // No request found

            await expect(UserService.resetPassword('invalid_token', 'password'))
                .rejects.toThrow('Invalid or expired reset token');
        });
    });
});
