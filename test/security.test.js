const request = require('supertest');

// Mocks (same minimal mocks)
jest.mock('../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../src/services/post-service', () => ({
    getPosts: jest.fn().mockResolvedValue([])
}));

const app = require('../src/server');

describe('Security Headers', () => {
    test('Responses should have security headers', async () => {
        const res = await request(app).get('/');
        
        // Helmet defaults
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN'); // strictly, or whatever helmet sets
        expect(res.headers['strict-transport-security']).toBeDefined();
        expect(res.headers['x-download-options']).toBe('noopen');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-xss-protection']).toBe('0'); // modern helmet disables this as it's deprecated/harmful
        expect(res.headers['content-security-policy']).toBeDefined();
    });

    test('CSP should restrict sources', async () => {
         const res = await request(app).get('/');
         const csp = res.headers['content-security-policy'];
         expect(csp).toContain("script-src 'self'");
         expect(csp).toContain("https://js.stripe.com");
    });
});
