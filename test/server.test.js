const request = require('supertest');
const app = require('../src/server');

// Mock database to prevent actual connections
jest.mock('../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

describe('Server', () => {
    describe('Startup', () => {
        test('GET / redirects to /post/list', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/post/list');
        });
    });

    describe('Error Handling', () => {
        test('404 for unknown routes', async () => {
            const res = await request(app).get('/unknown-route');
            expect(res.statusCode).toBe(404);
            expect(res.text).toContain('Error'); 
        });

        test('404 returns JSON for API requests', async () => {
            const res = await request(app)
                .get('/unknown-route')
                .set('Accept', 'application/json');
            
            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Not Found' });
        });
    });
});
