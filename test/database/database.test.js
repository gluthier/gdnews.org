const mariadb = require('mariadb');
const database = require('../../src/database/database');

// Mock mariadb
jest.mock('mariadb', () => {
    const mPool = {
        getConnection: jest.fn(),
        query: jest.fn(),
        end: jest.fn()
    };
    return {
        createPool: jest.fn(() => mPool)
    };
});

describe('Database Module', () => {
    let pool;

    beforeAll(() => {
        pool = mariadb.createPool();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getConnection delegates to pool.getConnection', async () => {
        const mockConnection = { release: jest.fn() };
        pool.getConnection.mockResolvedValue(mockConnection);

        const connection = await database.getConnection();
        expect(pool.getConnection).toHaveBeenCalled();
        expect(connection).toBe(mockConnection);
    });

    test('query delegates to pool.query', async () => {
        const mockResult = [{ id: 1 }];
        pool.query.mockResolvedValue(mockResult);

        const sql = 'SELECT * FROM users';
        const params = [];
        const result = await database.query(sql, params);

        expect(pool.query).toHaveBeenCalledWith(sql, params);
        expect(result).toBe(mockResult);
    });

    test('close delegates to pool.end', async () => {
        pool.end.mockResolvedValue();

        await database.close();
        expect(pool.end).toHaveBeenCalled();
    });
});
