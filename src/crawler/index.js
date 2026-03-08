const config = require('./config');
const sources = require('./sources');
const { fetchFeed, fetchArticleContent } = require('./fetcher');
const { analyzeArticleBatch, dispose } = require('./analyzer');
const { groupSimilarArticles, selectOriginal } = require('./deduplicator');

/**
 * @typedef {Object} CrawledArticle
 * @property {string} title
 * @property {string} url
 * @property {string} sourceName
 * @property {string|null} pubDate
 * @property {number} score
 * @property {string} reasoning
 */

async function runCrawler() {
    console.log('Starting crawler...');

    try {
        let allArticles = [];
        for (const source of sources) {
            console.log(`Fetching ${source.name}...`);
            const items = await fetchFeed(source);
            console.log(`- Found ${items.length} items.`);
            allArticles = allArticles.concat(items);
        }

        const fetchedCount = allArticles.length;

        const now = new Date();
        const cutoff = new Date(now.getTime() - config.lookbackHours * 60 * 60 * 1000);
        const recentArticles = allArticles.filter((article) => {
            const published = new Date(article.pubDate);
            if (Number.isNaN(published.getTime())) return false;
            return published >= cutoff;
        });

        const recentCount = recentArticles.length;
        if (recentCount === 0) {
            console.log('No recent articles found.');
            return {
                fetchedCount,
                recentCount: 0,
                dedupedCount: 0,
                analyzedCount: 0,
                filteredCount: 0,
                articles: []
            };
        }

        const groups = groupSimilarArticles(recentArticles);
        const uniqueArticles = groups.map(selectOriginal);
        const dedupedCount = uniqueArticles.length;

        const articlesToAnalyze = uniqueArticles.slice(0, config.analyzeLimit);
        for (const article of articlesToAnalyze) {
            article.contentFull = await fetchArticleContent(article.link);
            if (!article.contentFull) {
                article.contentFull = article.contentSnippet || '';
            }
        }

        const analyzedArticles = await analyzeArticleBatch(articlesToAnalyze);
        const analyzedCount = analyzedArticles.length;

        const filtered = analyzedArticles
            .filter((article) => article.score > 10)
            .filter((article) => article.title && article.link)
            .sort((a, b) => b.score - a.score)
            .slice(0, config.bundleSize)
            .map((article) => ({
                title: article.title,
                url: article.link,
                sourceName: article.sourceName,
                pubDate: article.pubDate || null,
                score: article.score,
                reasoning: article.reasoning || ''
            }));

        console.log(`Crawler finished: fetched=${fetchedCount}, recent=${recentCount}, deduped=${dedupedCount}, analyzed=${analyzedCount}, filtered=${filtered.length}`);

        return {
            fetchedCount,
            recentCount,
            dedupedCount,
            analyzedCount,
            filteredCount: filtered.length,
            articles: filtered
        };
    } finally {
        await dispose();
    }
}

if (require.main === module) {
    runCrawler()
        .then((result) => {
            console.log(JSON.stringify(result.articles, null, 2));
        })
        .catch((error) => {
            console.error('Crawler failed:', error);
            process.exitCode = 1;
        });
}

module.exports = runCrawler;
