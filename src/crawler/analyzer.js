const fs = require('fs');
const path = require('path');

const modelManager = require('./model_manager');

let llama = null;
let model = null;
let context = null;
let session = null;
let promptTemplate = null;

async function initializeModel() {
    if (model) return;

    console.log('Initializing local model...');
    const modelPath = await modelManager.ensureModelExists();

    const nodeLlamaCpp = await import('node-llama-cpp');
    const { getLlama, LlamaChatSession } = nodeLlamaCpp;

    llama = await getLlama();
    model = await llama.loadModel({ modelPath });
    context = await model.createContext();

    session = new LlamaChatSession({
        contextSequence: context.getSequence()
    });

    if (!promptTemplate) {
        const promptPath = path.join(__dirname, 'prompts', 'article_analysis_prompt.txt');
        promptTemplate = fs.readFileSync(promptPath, 'utf8');
    }

    console.log('Model initialized.');
}

async function rewriteTitle(originalTitle) {
    if (!session) return originalTitle;

    session.setChatHistory([]);

    const prompt = `Rewrite the following news headline to be shorter than 180 characters. Keep the original meaning. Output ONLY the new headline, nothing else.\n\nOriginal: "${originalTitle}"\nNew Headline:`;

    try {
        const response = await session.prompt(prompt, {
            systemPrompt: 'You are a helpful editor. You shorten headlines.',
            temperature: 0.3,
            maxTokens: 100,
            stopOnAbortSignal: true
        });

        let newTitle = response.trim();
        if (newTitle.startsWith('"') && newTitle.endsWith('"')) {
            newTitle = newTitle.slice(1, -1);
        }

        return newTitle;
    } catch (err) {
        console.error('Failed to rewrite title:', err);
        return originalTitle;
    }
}

async function scoreArticle(article) {
    session.setChatHistory([]);

    const prompt = promptTemplate
        .replace('{{TITLE}}', article.title)
        .replace('{{SOURCE}}', article.sourceName)
        .replace('{{CONTENT}}', article.contentSnippet ? article.contentSnippet.substring(0, 500) : 'No content');

    const response = await session.prompt(prompt, {
        systemPrompt: 'You are a helpful assistant for game developers. You output strictly JSON.',
        temperature: 0.7,
        maxTokens: 200,
        responsePrefix: '{',
        stopOnAbortSignal: true
    });

    try {
        let jsonStr = response.trim();
        if (!jsonStr.startsWith('{')) {
            jsonStr = `{${jsonStr}`;
        }

        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        return JSON.parse(jsonStr);
    } catch (error) {
        console.warn(`JSON parse failed for ${article.title}. Raw: ${response}`);
        return { score: 0, reasoning: 'JSON parse failed' };
    }
}

async function analyzeArticleBatch(articles) {
    try {
        await initializeModel();
    } catch (err) {
        console.error('Failed to initialize model:', err);
        return articles.map((article) => ({ ...article, score: 0, reasoning: 'Model initialization failed' }));
    }

    const results = [];

    for (const article of articles) {
        try {
            let title = article.title;
            if (title && title.length > 180) {
                title = await rewriteTitle(title);
            }

            if (!title || title.length > 180) {
                results.push({ ...article, score: 0, reasoning: 'Title length exceeds limit after rewrite', title });
                continue;
            }

            const scoreData = await scoreArticle({ ...article, title });
            results.push({ ...article, ...scoreData, title });
        } catch (err) {
            console.error(`Failed to analyze ${article.title}:`, err.message);
            results.push({ ...article, score: 0, reasoning: 'Analysis failed' });
        }
    }

    return results;
}

async function dispose() {
    if (session) {
        session.dispose();
        session = null;
    }
    if (context) {
        await context.dispose();
        context = null;
    }
    if (model) {
        await model.dispose();
        model = null;
    }
    if (llama) {
        await llama.dispose();
        llama = null;
    }
}

module.exports = {
    analyzeArticleBatch,
    dispose
};
