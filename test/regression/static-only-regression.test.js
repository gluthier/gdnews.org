const fs = require('fs');
const path = require('path');

describe('static-only regression', () => {
    test('legacy server entrypoints and dynamic route directories are removed', () => {
        const root = path.join(__dirname, '../..');

        expect(fs.existsSync(path.join(root, 'src/server.js'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'src/routes'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'src/middleware'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'src/batch_server'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'views'))).toBe(false);
    });
});
