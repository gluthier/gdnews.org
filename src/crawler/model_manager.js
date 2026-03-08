const fs = require('fs');
const path = require('path');
const axios = require('axios');

const config = require('./config');

async function ensureModelExists() {
    const modelPath = path.resolve(process.cwd(), config.localModelPath);
    const modelDir = path.dirname(modelPath);

    if (fs.existsSync(modelPath)) {
        console.log(`Model found at ${modelPath}`);
        return modelPath;
    }

    console.log(`Model not found at ${modelPath}. Downloading from ${config.localModelUrl}...`);

    if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
    }

    const tempPath = `${modelPath}.tmp`;
    const writer = fs.createWriteStream(tempPath);

    try {
        const response = await axios({
            url: config.localModelUrl,
            method: 'GET',
            responseType: 'stream'
        });

        const totalLength = Number(response.headers['content-length'] || 0);
        let downloadedLength = 0;

        if (totalLength > 0) {
            console.log(`Starting download of ${(totalLength / 1024 / 1024).toFixed(2)} MB...`);
        }

        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            if (totalLength > 0) {
                const progress = ((downloadedLength / totalLength) * 100).toFixed(2);
                process.stdout.write(`\rDownloading: ${progress}%`);
            }
        });

        response.data.pipe(writer);

        return await new Promise((resolve, reject) => {
            writer.on('finish', () => {
                if (totalLength > 0) process.stdout.write('\n');
                fs.renameSync(tempPath, modelPath);
                console.log('Download complete.');
                resolve(modelPath);
            });
            writer.on('error', (err) => {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                reject(err);
            });
        });
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        console.error('Failed to download model:', error.message);
        throw error;
    }
}

module.exports = {
    ensureModelExists
};
