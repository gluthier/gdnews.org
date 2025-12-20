const UserService = require('../../src/services/user-service');
const database = require('../../src/database/database');
const bcrypt = require('bcrypt');

jest.mock('../../src/database/database');
jest.mock('bcrypt');

describe('UserService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createUser', () => {
        it('should insert user', async () => {
            database.query.mockResolvedValue({ insertId: 1 });
            const result = await UserService.createUser({ username: 'user', password_hash: 'hash', email: 'email@example.com' });
            
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['user', 'hash', 'email@example.com']
            );
            expect(result).toEqual({ insertId: 1 });
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
                email: 'gdnews-bot@gdnews.org'
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
