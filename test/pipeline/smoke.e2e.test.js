const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const shouldRun = process.env.RUN_E2E_SMOKE === 'true';
const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe('local e2e smoke', () => {
    test('db reset + refresh generates static homepage', () => {
        const repoRoot = path.join(__dirname, '../..');

        execSync('node src/database/reset_minimal_db.js --yes', {
            cwd: repoRoot,
            stdio: 'inherit',
            env: { ...process.env, GDNEWS_CONFIRM_DB_RESET: 'true' }
        });

        execSync('node src/pipeline/refresh.js', {
            cwd: repoRoot,
            stdio: 'inherit',
            env: process.env
        });

        expect(fs.existsSync(path.join(repoRoot, 'public/index.html'))).toBe(true);
    });
});
