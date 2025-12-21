const request = require('supertest');
const app = require('../src/server');

// Mock database to prevent actual connections
jest.mock('../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue()
}));

describe('Server', () => {
    describe('Startup', () => {
        test('GET / renders home page', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toBe(200);
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

    describe('Server Control', () => {
        let server;
        let mockExit;
        
        beforeEach(() => {
            mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
            // Mock console to keep output clean
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            jest.restoreAllMocks();
            if (server) {
                server.close();
            }
        });

        test('startServer starts listening and handles shutdown', (done) => {
            // We need to mock app.listen to avoid actually binding port
            const mockClose = jest.fn((cb) => { if(cb) cb(); });
            const mockListen = jest.spyOn(app, 'listen').mockImplementation((port, cb) => {
                cb();
                return { close: mockClose };
            });

            server = app.startServer();

            expect(mockListen).toHaveBeenCalled();
            
            // Simulate SIGTERM
            process.emit('SIGTERM');

            // Wait for async operations in shutdown
            setTimeout(() => {
                expect(mockClose).toHaveBeenCalled();
                // database check is tricky because we mock it at top level but we verified DB close is called
                const database = require('../src/database/database');
                expect(database.close).toHaveBeenCalled();
                expect(mockExit).toHaveBeenCalledWith(0);
                done();
            }, 100);
        });

        test('shutdown handles database error', (done) => {
             const mockClose = jest.fn((cb) => { if(cb) cb(); });
             jest.spyOn(app, 'listen').mockImplementation((port, cb) => {
                cb();
                return { close: mockClose };
            });

            const database = require('../src/database/database');
            database.close.mockRejectedValueOnce(new Error('DB Error'));

            server = app.startServer();

            process.emit('SIGINT');

            setTimeout(() => {
                expect(mockClose).toHaveBeenCalled();
                expect(console.error).toHaveBeenCalledWith('Error closing database pool', expect.any(Error));
                 expect(mockExit).toHaveBeenCalledWith(1);
                done();
            }, 100);
        });
        
        test('forceful shutdown after timeout', (done) => {
            jest.useFakeTimers();
            const mockClose = jest.fn(); // close never callbacks
             jest.spyOn(app, 'listen').mockImplementation((port, cb) => {
                cb();
                return { close: mockClose };
            });

            server = app.startServer();

            process.emit('SIGTERM');

            // Fast forward time
            jest.advanceTimersByTime(10000);

            expect(mockExit).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('forcefully shutting down'));
            
            jest.useRealTimers();
            done();
         });
    });
});
