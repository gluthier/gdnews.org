require('dotenv').config();

const toInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
    localModelPath: process.env.CRAWLER_MODEL_PATH || 'models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    localModelUrl: process.env.CRAWLER_MODEL_URL || 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    bundleSize: toInt(process.env.CRAWLER_BUNDLE_SIZE, 15),
    lookbackHours: toInt(process.env.CRAWLER_LOOKBACK_HOURS, 24),
    analyzeLimit: toInt(process.env.CRAWLER_ANALYZE_LIMIT, 30)
};
