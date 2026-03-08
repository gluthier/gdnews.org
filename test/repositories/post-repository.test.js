jest.mock('../../src/database/database', () => ({
    query: jest.fn()
}));

const database = require('../../src/database/database');
const PostRepository = require('../../src/repositories/post-repository');

describe('PostRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('insertManyIgnoreDuplicates inserts new posts and reports skipped duplicates', async () => {
        database.query.mockResolvedValue({ affectedRows: 2 });

        const result = await PostRepository.insertManyIgnoreDuplicates([
            { title: 'A', url: 'https://example.com/a', sourceName: 'Src', pubDate: '2026-01-01T10:00:00Z', score: 60, reasoning: 'r1' },
            { title: 'B', url: 'https://example.com/b', sourceName: 'Src', pubDate: '2026-01-01T11:00:00Z', score: 50, reasoning: 'r2' },
            { title: 'C', url: 'https://example.com/c', sourceName: 'Src', pubDate: '2026-01-01T12:00:00Z', score: 40, reasoning: 'r3' }
        ]);

        expect(database.query).toHaveBeenCalledTimes(1);
        expect(database.query.mock.calls[0][0]).toContain('INSERT IGNORE INTO posts');
        expect(result).toEqual({ insertedCount: 2, skippedCount: 1 });
    });

    test('listPage uses limit/offset pagination', async () => {
        database.query.mockResolvedValue([{ id: 1 }]);

        const rows = await PostRepository.listPage({ page: 3, limit: 30 });

        expect(rows).toEqual([{ id: 1 }]);
        expect(database.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [30, 60]);
    });

    test('countAll returns numeric count', async () => {
        database.query.mockResolvedValue([{ count: '65' }]);

        const count = await PostRepository.countAll();

        expect(count).toBe(65);
    });
});
