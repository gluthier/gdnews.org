const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const shouldRun = process.env.RUN_E2E_SMOKE === 'true';
const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe('local e2e smoke', () => {
    test('post store reset + refresh generates static homepage', () => {
        const repoRoot = path.join(__dirname, '../..');

        execSync('node src/repositories/reset-post-store.js', {
            cwd: repoRoot,
            stdio: 'inherit',
            env: process.env
        });

        execSync('node src/pipeline/refresh.js', {
            cwd: repoRoot,
            stdio: 'inherit',
            env: process.env
        });

        expect(fs.existsSync(path.join(repoRoot, 'public/index.html'))).toBe(true);
    });
});
