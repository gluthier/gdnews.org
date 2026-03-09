jest.mock('../../src/crawler', () => jest.fn());
jest.mock('../../src/repositories/post-repository', () => ({
    insertManyIgnoreDuplicates: jest.fn()
}));
jest.mock('../../src/static/build-site', () => jest.fn());

const runCrawler = require('../../src/crawler');
const PostRepository = require('../../src/repositories/post-repository');
const buildSite = require('../../src/static/build-site');
const refreshPipeline = require('../../src/pipeline/refresh');
const { runRefreshCli } = require('../../src/pipeline/refresh');

describe('refresh pipeline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('runs crawl -> ingest -> static build in sequence and returns summary', async () => {
        runCrawler.mockResolvedValue({
            fetchedCount: 100,
            recentCount: 50,
            dedupedCount: 40,
            analyzedCount: 30,
            filteredCount: 15,
            articles: [
                { title: 'Post 1', url: 'https://example.com/1', sourceName: 'A', pubDate: '2026-01-01T10:00:00Z', score: 70, reasoning: 'good' }
            ]
        });
        PostRepository.insertManyIgnoreDuplicates.mockResolvedValue({ insertedCount: 1, skippedCount: 0 });
        buildSite.mockResolvedValue({ totalPosts: 10, totalPages: 1 });

        const summary = await refreshPipeline();

        expect(runCrawler).toHaveBeenCalledTimes(1);
        expect(PostRepository.insertManyIgnoreDuplicates).toHaveBeenCalledTimes(1);
        expect(buildSite).toHaveBeenCalledTimes(1);

        expect(runCrawler.mock.invocationCallOrder[0]).toBeLessThan(PostRepository.insertManyIgnoreDuplicates.mock.invocationCallOrder[0]);
        expect(PostRepository.insertManyIgnoreDuplicates.mock.invocationCallOrder[0]).toBeLessThan(buildSite.mock.invocationCallOrder[0]);

        expect(summary).toMatchObject({
            fetched: 100,
            recent: 50,
            deduped: 40,
            analyzed: 30,
            filtered: 15,
            inserted: 1,
            skipped: 0,
            totalPosts: 10,
            pagesGenerated: 1
        });
    });

    test('cli exits successfully when refresh completes', async () => {
        runCrawler.mockResolvedValue({
            fetchedCount: 0,
            recentCount: 0,
            dedupedCount: 0,
            analyzedCount: 0,
            filteredCount: 0,
            articles: []
        });
        PostRepository.insertManyIgnoreDuplicates.mockResolvedValue({ insertedCount: 0, skippedCount: 0 });
        buildSite.mockResolvedValue({ totalPosts: 0, totalPages: 1 });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

        await runRefreshCli();

        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
    });

    test('cli exits with failure code when refresh throws', async () => {
        runCrawler.mockRejectedValue(new Error('boom'));

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await runRefreshCli();

        expect(errorSpy).toHaveBeenCalledWith('Refresh pipeline failed:', expect.any(Error));
        expect(exitSpy).toHaveBeenCalledWith(1);

        errorSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
