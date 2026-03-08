const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

async function fetchFeed(source) {
    try {
        const feed = await parser.parseURL(source.url);
        return feed.items.map((item) => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            sourceName: source.name,
            contentSnippet: item.contentSnippet || item.content
        }));
    } catch (error) {
        console.error(`Error fetching feed for ${source.name}:`, error.message);
        return [];
    }
}

async function fetchArticleContent(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        $('script, style, nav, header, footer, .ad, .advertisement').remove();

        const selectors = [
            'article',
            '[role="main"]',
            '.post-content',
            '.article-body',
            '.entry-content',
            'main'
        ];

        let content = '';
        for (const selector of selectors) {
            if ($(selector).length > 0) {
                content = $(selector).text();
                break;
            }
        }

        if (!content) {
            content = $('body').text();
        }

        return content.replace(/\s+/g, ' ').trim().substring(0, 5000);
    } catch (error) {
        console.error(`Error fetching content for ${url}:`, error.message);
        return null;
    }
}

module.exports = {
    fetchFeed,
    fetchArticleContent
};
