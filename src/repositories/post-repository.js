const database = require('../database/database');

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

        const placeholders = normalized.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const params = [];
        for (const post of normalized) {
            params.push(post.title, post.url, post.sourceName, post.publishedAt, post.score, post.reasoning);
        }

        const result = await database.query(
            `INSERT IGNORE INTO posts (title, url, source_name, published_at, score, reasoning) VALUES ${placeholders}`,
            params
        );

        const insertedCount = Number(result.affectedRows || 0);
        return {
            insertedCount,
            skippedCount: normalized.length - insertedCount
        };
    },

    async listPage({ page = 1, limit = 30 }) {
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 30);
        const offset = (safePage - 1) * safeLimit;

        return database.query(
            `SELECT id, title, url, source_name, published_at, score, reasoning, created_at
             FROM posts
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [safeLimit, offset]
        );
    },

    async countAll() {
        const rows = await database.query('SELECT COUNT(*) AS count FROM posts');
        return Number(rows[0].count || 0);
    }
};

module.exports = PostRepository;
