jest.mock('fs/promises', () => ({
    access: jest.fn(),
    mkdir: jest.fn().mockResolvedValue(),
    readFile: jest.fn(),
    writeFile: jest.fn()
}));

const fs = require('fs/promises');
const PostRepository = require('../../src/repositories/post-repository');

describe('PostRepository', () => {
    let store;

    beforeEach(() => {
        jest.clearAllMocks();
        store = '[]\n';
        fs.access.mockResolvedValue();
        fs.readFile.mockImplementation(async () => store);
        fs.writeFile.mockImplementation(async (_path, contents) => {
            store = contents;
        });
    });

    test('insertManyIgnoreDuplicates inserts new posts and reports skipped duplicates', async () => {
        const result = await PostRepository.insertManyIgnoreDuplicates([
            { title: 'A', url: 'https://example.com/a', sourceName: 'Src', pubDate: '2026-01-01T10:00:00Z', score: 60, reasoning: 'r1' },
            { title: 'B', url: 'https://example.com/b', sourceName: 'Src', pubDate: '2026-01-01T11:00:00Z', score: 50, reasoning: 'r2' },
            { title: 'Duplicate B', url: 'https://example.com/b', sourceName: 'Src', pubDate: '2026-01-01T12:00:00Z', score: 40, reasoning: 'r3' }
        ]);

        expect(result).toEqual({ insertedCount: 2, skippedCount: 1 });
        expect(JSON.parse(store)).toHaveLength(2);
        expect(JSON.parse(store)[0]).toMatchObject({
            id: 1,
            title: 'A',
            url: 'https://example.com/a',
            source_name: 'Src',
            published_at: '2026-01-01 10:00:00'
        });
    });

    test('listPage uses limit/offset pagination', async () => {
        store = `${JSON.stringify([
            { id: 1, title: 'Older', url: 'https://example.com/1', created_at: '2026-01-01T10:00:00.000Z' },
            { id: 2, title: 'Middle', url: 'https://example.com/2', created_at: '2026-01-01T11:00:00.000Z' },
            { id: 3, title: 'Newest', url: 'https://example.com/3', created_at: '2026-01-01T12:00:00.000Z' }
        ])}\n`;

        const rows = await PostRepository.listPage({ page: 2, limit: 2 });

        expect(rows).toEqual([
            expect.objectContaining({ id: 1, title: 'Older' })
        ]);
    });

    test('countAll returns numeric count', async () => {
        store = `${JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }])}\n`;

        const count = await PostRepository.countAll();

        expect(count).toBe(3);
    });

    test('reset clears all stored posts', async () => {
        store = `${JSON.stringify([{ id: 1 }])}\n`;

        await PostRepository.reset();

        expect(JSON.parse(store)).toEqual([]);
    });
});
