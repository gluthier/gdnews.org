jest.mock('fs/promises', () => ({
    rm: jest.fn().mockResolvedValue(),
    mkdir: jest.fn().mockResolvedValue(),
    writeFile: jest.fn().mockResolvedValue()
}));

jest.mock('../../src/repositories/post-repository', () => ({
    countAll: jest.fn(),
    listPage: jest.fn()
}));

const fs = require('fs/promises');
const PostRepository = require('../../src/repositories/post-repository');
const buildSite = require('../../src/static/build-site');

describe('build-site', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('generates static pagination, row format, and clears stale page dir', async () => {
        PostRepository.countAll.mockResolvedValue(65);
        PostRepository.listPage.mockImplementation(async ({ page, limit }) => {
            const start = (page - 1) * limit + 1;
            const end = Math.min(start + limit - 1, 65);
            const rows = [];
            for (let id = start; id <= end; id += 1) {
                rows.push({
                    id,
                    title: `Post ${id}`,
                    url: `https://example.com/${id}`,
                    source_name: 'Example',
                    published_at: '2026-01-01T10:00:00Z',
                    created_at: '2026-01-01T10:00:00Z'
                });
            }
            return rows;
        });

        const result = await buildSite();

        expect(result.totalPages).toBe(3);
        expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('/public/page'), { recursive: true, force: true });
        expect(fs.writeFile).toHaveBeenCalledTimes(3);

        const firstPageCall = fs.writeFile.mock.calls.find((call) => call[0].endsWith('/public/index.html'));
        expect(firstPageCall).toBeDefined();

        const html = firstPageCall[1];
        expect(html).toContain('https://example.com/1');
        expect(html).toContain('example.com');
        expect(html).toContain('2026-01-01');
        expect(html).toContain('page/2/');
        expect(html).toContain('style.min.css');
    });
});
