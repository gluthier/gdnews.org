const request = require('supertest');

// Mock database to prevent connection attempts
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));

// Import app after mocks
const app = require('../../src/server');

describe('Static Routes', () => {
    test('GET /about renders successfully', async () => {
        const res = await request(app).get('/about');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain('About');
    });

    test('GET /guidelines renders successfully', async () => {
        const res = await request(app).get('/guidelines');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain('Guidelines');
    });

    test('GET /legal renders successfully', async () => {
        const res = await request(app).get('/legal');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain('Legal');
    });
});
