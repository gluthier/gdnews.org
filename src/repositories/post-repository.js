const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../data/posts.json');

const sanitizeText = (value, maxLength) => {
    if (value == null) return null;
    const stringValue = String(value).trim();
    if (!stringValue) return null;
    return stringValue.length <= maxLength ? stringValue : stringValue.slice(0, maxLength);
};

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

async function ensureStore() {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });

    try {
        await fs.access(STORE_PATH);
    } catch (error) {
        await fs.writeFile(STORE_PATH, '[]\n', 'utf8');
    }
}

async function loadPosts() {
    await ensureStore();
    const raw = await fs.readFile(STORE_PATH, 'utf8');

    if (!raw.trim()) {
        return [];
    }

    const posts = JSON.parse(raw);
    if (!Array.isArray(posts)) {
        throw new Error(`Post store must contain a JSON array: ${STORE_PATH}`);
    }

    return posts;
}

async function savePosts(posts) {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

function sortPosts(posts) {
    return [...posts].sort((left, right) => {
        const leftCreatedAt = Date.parse(left.created_at || '') || 0;
        const rightCreatedAt = Date.parse(right.created_at || '') || 0;

        if (rightCreatedAt !== leftCreatedAt) {
            return rightCreatedAt - leftCreatedAt;
        }

        return (Number(right.id) || 0) - (Number(left.id) || 0);
    });
}

const PostRepository = {
    async insertManyIgnoreDuplicates(posts) {
        if (!Array.isArray(posts) || posts.length === 0) {
            return { insertedCount: 0, skippedCount: 0 };
        }

        const normalized = posts
            .map((post) => ({
                title: sanitizeText(post.title, 255),
                url: sanitizeText(post.url, 2048),
                sourceName: sanitizeText(post.sourceName, 255),
                publishedAt: parseDate(post.pubDate || post.publishedAt),
                score: Number.isFinite(post.score) ? Math.trunc(post.score) : 0,
                reasoning: sanitizeText(post.reasoning, 10000)
            }))
            .filter((post) => post.title && post.url);

        if (normalized.length === 0) {
            return { insertedCount: 0, skippedCount: posts.length };
        }

        const storedPosts = await loadPosts();
        const seenUrls = new Set(storedPosts.map((post) => post.url));
        let nextId = storedPosts.reduce((maxId, post) => Math.max(maxId, Number(post.id) || 0), 0) + 1;
        let insertedCount = 0;

        for (const post of normalized) {
            if (seenUrls.has(post.url)) {
                continue;
            }

            seenUrls.add(post.url);
            insertedCount += 1;
            storedPosts.push({
                id: nextId,
                title: post.title,
                url: post.url,
                source_name: post.sourceName,
                published_at: post.publishedAt,
                score: post.score,
                reasoning: post.reasoning,
                created_at: new Date().toISOString()
            });
            nextId += 1;
        }

        await savePosts(storedPosts);

        return {
            insertedCount,
            skippedCount: normalized.length - insertedCount
        };
    },

    async listPage({ page = 1, limit = 30 }) {
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 30);
        const offset = (safePage - 1) * safeLimit;

        const posts = sortPosts(await loadPosts());
        return posts.slice(offset, offset + safeLimit);
    },

    async countAll() {
        const posts = await loadPosts();
        return posts.length;
    },

    async reset() {
        await savePosts([]);
    }
};

module.exports = PostRepository;
