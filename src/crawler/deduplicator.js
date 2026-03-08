function getBigrams(str) {
    const normalized = String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length < 2) return [];

    const bigrams = new Array(normalized.length - 1);
    for (let i = 0; i < bigrams.length; i += 1) {
        bigrams[i] = normalized.slice(i, i + 2);
    }

    return bigrams;
}

function stringSimilarity(str1, str2) {
    const pairs1 = getBigrams(str1);
    const pairs2 = getBigrams(str2);

    if (pairs1.length === 0 || pairs2.length === 0) return 0;

    const set2 = new Map();
    for (const pair of pairs2) {
        set2.set(pair, (set2.get(pair) || 0) + 1);
    }

    let hitCount = 0;
    for (const pair of pairs1) {
        const count = set2.get(pair) || 0;
        if (count > 0) {
            hitCount += 1;
            set2.set(pair, count - 1);
        }
    }

    return (2.0 * hitCount) / (pairs1.length + pairs2.length);
}

function groupSimilarArticles(articles) {
    const groups = [];
    const visited = new Set();

    const sorted = [...articles].sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));

    for (let i = 0; i < sorted.length; i += 1) {
        if (visited.has(i)) continue;

        const group = [sorted[i]];
        visited.add(i);

        for (let j = i + 1; j < sorted.length; j += 1) {
            if (visited.has(j)) continue;

            const similarity = stringSimilarity(sorted[i].title, sorted[j].title);
            if (similarity > 0.6) {
                group.push(sorted[j]);
                visited.add(j);
            }
        }

        groups.push(group);
    }

    return groups;
}

function selectOriginal(group) {
    return group[0];
}

module.exports = {
    groupSimilarArticles,
    selectOriginal
};
