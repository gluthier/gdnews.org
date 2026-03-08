const database = require('../src/database/database');
const PostRepository = require('../src/repositories/post-repository');

const DEFAULT_COUNT = 60;
const SOURCES = [
    'example.com',
    'fakenews.local',
    'sample.blog',
    'dev.news'
];

const parseArgs = () => {
    const args = process.argv.slice(2);
    const getValue = (key, fallback) => {
        const match = args.find((arg) => arg === key || arg.startsWith(`${key}=`));
        if (!match) return fallback;

        if (match === key) {
            const valueIndex = args.indexOf(match) + 1;
            return args[valueIndex];
        }

        return match.split('=', 2)[1];
    };

    const clearFlag = args.includes('--clear');
    const countRaw = getValue('--count', String(DEFAULT_COUNT));

    return {
        count: Math.max(1, Number.parseInt(countRaw, 10) || DEFAULT_COUNT),
        clear: clearFlag
    };
};

const buildPosts = (count) => {
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => {
        const dayOffset = index % 28;
        const source = SOURCES[index % SOURCES.length];

    return {
        title: `Fake news article #${index + 1} for pagination testing`,
        url: `https://example.com/fake-gdnews-${dayOffset}/article-${index + 1}-${now}`,
        sourceName: source,
        pubDate: new Date(now - (index * 3600 * 1000)).toISOString(),
        score: (index % 20) + 1,
        reasoning: `Synthetic entry created for pagination QA at index ${index + 1}`
    };
    });
};

async function seed() {
    const { count, clear } = parseArgs();
    const posts = buildPosts(count);

    if (clear) {
        await database.query('TRUNCATE TABLE posts');
    }

    const result = await PostRepository.insertManyIgnoreDuplicates(posts);

    console.log(`Fake data seed complete: inserted ${result.insertedCount}, skipped ${result.skippedCount}, requested ${count}.`);
}

seed()
    .then(() => database.close())
    .catch((error) => {
        console.error('Seed failed:', error.message);
        database.close().finally(() => process.exit(1));
    });
