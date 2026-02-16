const UserService = require('../../src/services/user-service');
const database = require('../../src/database/database');
const bcrypt = require('bcrypt');
const EmailService = require('../../src/services/email-service');

jest.mock('../../src/database/database');
jest.mock('bcrypt');
jest.mock('../../src/services/email-service');

describe('UserService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createUser', () => {
        it('should insert user', async () => {
            // Mock createUser insert
            database.query.mockResolvedValueOnce({ insertId: 1 });
            // Mock initiateEmailConfirmation insert
            database.query.mockResolvedValueOnce({ insertId: 100 });

            const result = await UserService.createUser({ username: 'user', password_hash: 'hash', email: 'email@example.com' });
            
            expect(database.query).toHaveBeenNthCalledWith(1,
                expect.stringContaining('INSERT INTO users'),
                ['user', 'hash', 'email@example.com', false, 'normal']
            );
            // Verify email confirmation initiated
            expect(database.query).toHaveBeenNthCalledWith(2,
                expect.stringContaining('INSERT INTO email_confirmations'),
                expect.arrayContaining([1, 'email@example.com', 'REGISTER'])
            );
            expect(EmailService.sendConfirmationEmail).toHaveBeenCalled();
            expect(result).toEqual({ insertId: 1 });
        });

        it('should insert user without email', async () => {
             database.query.mockResolvedValue({ insertId: 2 });
             await UserService.createUser({ username: 'noemail', password_hash: 'hash' });
             
             expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['noemail', 'hash', null, false, 'normal']
            );
            expect(EmailService.sendConfirmationEmail).not.toHaveBeenCalled();
        });
    });

    describe('getUserByUsername', () => {
        it('should return user if found', async () => {
            const mockUser = { id: 1, username: 'test' };
            database.query.mockResolvedValue([mockUser]);

            const result = await UserService.getUserByUsername('test');
            expect(result).toEqual(mockUser);
            expect(database.query).toHaveBeenCalledWith(expect.stringContaining('username = ?'), ['test']);
        });

        it('should return null if not found', async () => {
             database.query.mockResolvedValue([]);
             const result = await UserService.getUserByUsername('test');
             expect(result).toBeNull();
        });
    });

    describe('getUserByEmail', () => {
        it('should return user if found with case-insensitive match', async () => {
            const mockUser = { id: 1, email: 'test@example.com' };
            database.query.mockResolvedValue([mockUser]);

            const result = await UserService.getUserByEmail('TEST@example.com');
            expect(result).toEqual(mockUser);
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('LOWER(email) = LOWER(?)'),
                ['TEST@example.com']
            );
        });

        it('should return null if not found', async () => {
            database.query.mockResolvedValue([]);
            const result = await UserService.getUserByEmail('missing@example.com');
            expect(result).toBeNull();
        });
    });

    describe('getUserById', () => {
        it('should return user if found', async () => {
            const mockUser = { id: 1, username: 'test' };
            database.query.mockResolvedValue([mockUser]);

            const result = await UserService.getUserById(1);
            expect(result).toEqual(mockUser);
            expect(database.query).toHaveBeenCalledWith(expect.stringContaining('id = ?'), [1]);
        });
         it('should return null if not found', async () => {
             database.query.mockResolvedValue([]);
             const result = await UserService.getUserById(1);
             expect(result).toBeNull();
        });
    });

    describe('updateUserEmail', () => {
        it('should update email', async () => {
            database.query.mockResolvedValue({ affectedRows: 1 });
            await UserService.updateUserEmail(1, 'new@example.com');
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET email = ?'),
                ['new@example.com', 1]
            );
        });
    });

    describe('initiateEmailConfirmation', () => {
        it('should insert confirmation and send email', async () => {
            database.query.mockResolvedValue({ insertId: 100 });
            
            const token = await UserService.initiateEmailConfirmation(1, 'test@example.com', 'REGISTER');
            
            expect(token).toHaveLength(64); // 32 bytes hex
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO email_confirmations'),
                expect.arrayContaining([1, 'test@example.com', token, 'REGISTER'])
            );
            expect(EmailService.sendConfirmationEmail).toHaveBeenCalledWith('test@example.com', token, 'REGISTER');
        });
    });

    describe('verifyAndComplete', () => {
        it('should verify REGISTER token and update user', async () => {
            const mockRequest = { id: 50, user_id: 1, email: 'test@example.com', type: 'REGISTER' };
            database.query.mockResolvedValueOnce([mockRequest]); // For select
            database.query.mockResolvedValueOnce({ affectedRows: 1 }); // For user update
            database.query.mockResolvedValueOnce({ affectedRows: 1 }); // For delete

            const result = await UserService.verifyAndComplete('valid_token');

            expect(result).toEqual(mockRequest);
            expect(database.query).toHaveBeenNthCalledWith(1,
                expect.stringContaining('SELECT * FROM email_confirmations'),
                ['valid_token']
            );
            expect(database.query).toHaveBeenNthCalledWith(2,
                expect.stringContaining('UPDATE users SET email_verified = TRUE'),
                [1]
            );
            expect(database.query).toHaveBeenNthCalledWith(3,
                expect.stringContaining('DELETE FROM email_confirmations'),
                [50]
            );
        });

        it('should verify CHANGE_EMAIL token and update email', async () => {
            const mockRequest = { id: 51, user_id: 1, email: 'new@example.com', type: 'CHANGE_EMAIL' };
            database.query.mockResolvedValueOnce([mockRequest]);
            database.query.mockResolvedValueOnce({ affectedRows: 1 });
            database.query.mockResolvedValueOnce({ affectedRows: 1 });

            const result = await UserService.verifyAndComplete('valid_change_token');

            expect(result).toEqual(mockRequest);
            expect(database.query).toHaveBeenNthCalledWith(2,
                expect.stringContaining('UPDATE users SET email = ?, email_verified = TRUE'),
                ['new@example.com', 1]
            );
        });

        it('should throw error if token is invalid or expired', async () => {
            database.query.mockResolvedValueOnce([]); // No request found

            await expect(UserService.verifyAndComplete('invalid_token'))
                .rejects.toThrow('Invalid or expired token');
        });
    });

    describe('ensureBotUser', () => {
        it('should create bot user if not exists', async () => {
            // First check returns empty
            database.query.mockResolvedValueOnce([]); 
            // Mock bcrypt hash
            bcrypt.hash.mockResolvedValue('hashed_bot_password');
            // Mock insert
            database.query.mockResolvedValueOnce({ insertId: 99 });

            // Spy on createUser to verify it's called
            const createUserSpy = jest.spyOn(UserService, 'createUser');

            await UserService.ensureBotUser();

            expect(database.query).toHaveBeenNthCalledWith(1, expect.stringContaining('username = ?'), ['gdnews-bot']);
            expect(bcrypt.hash).toHaveBeenCalled();
            expect(createUserSpy).toHaveBeenCalledWith({
                username: 'gdnews-bot',
                password_hash: 'hashed_bot_password',
                email: 'gdnews-bot@gdnews.org',
                user_type: 'bot'
            });
        });

        it('should do nothing if bot user exists', async () => {
            database.query.mockResolvedValueOnce([{ id: 99, username: 'gdnews-bot' }]);
            
            await UserService.ensureBotUser();
            
            // Should only call check, not insert
            expect(database.query).toHaveBeenCalledTimes(1);
            expect(bcrypt.hash).not.toHaveBeenCalled();
        });
    });
});
