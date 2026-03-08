const runCrawler = require('../crawler');
const PostRepository = require('../repositories/post-repository');
const buildSite = require('../static/build-site');
const database = require('../database/database');

/**
 * @typedef {Object} CrawledArticle
 * @property {string} title
 * @property {string} url
 * @property {string} sourceName
 * @property {string|null} pubDate
 * @property {number} score
 * @property {string} reasoning
 */

async function refreshPipeline() {
    const crawlResult = await runCrawler();
    const crawledArticles = Array.isArray(crawlResult.articles) ? crawlResult.articles : [];

    const ingestResult = await PostRepository.insertManyIgnoreDuplicates(crawledArticles);
    const buildResult = await buildSite();

    const summary = {
        fetched: crawlResult.fetchedCount || 0,
        recent: crawlResult.recentCount || 0,
        deduped: crawlResult.dedupedCount || 0,
        analyzed: crawlResult.analyzedCount || 0,
        filtered: crawlResult.filteredCount || crawledArticles.length,
        inserted: ingestResult.insertedCount,
        skipped: ingestResult.skippedCount,
        totalPosts: buildResult.totalPosts,
        pagesGenerated: buildResult.totalPages
    };

    console.log('Refresh summary:');
    console.log(`- fetched: ${summary.fetched}`);
    console.log(`- recent: ${summary.recent}`);
    console.log(`- deduped: ${summary.deduped}`);
    console.log(`- analyzed: ${summary.analyzed}`);
    console.log(`- filtered: ${summary.filtered}`);
    console.log(`- inserted: ${summary.inserted}`);
    console.log(`- skipped: ${summary.skipped}`);
    console.log(`- total posts in DB: ${summary.totalPosts}`);
    console.log(`- static pages generated: ${summary.pagesGenerated}`);

    return summary;
}

if (require.main === module) {
    (async () => {
        try {
            await refreshPipeline();
        } catch (error) {
            console.error('Refresh pipeline failed:', error);
            process.exitCode = 1;
        } finally {
            try {
                await database.close();
            } finally {
                process.exit(process.exitCode || 0);
            }
        }
    })();
}

module.exports = refreshPipeline;
