const requireLogin = require('../../src/middleware/auth');
const UserService = require('../../src/services/user-service');

jest.mock('../../src/services/user-service', () => ({
    checkBanStatus: jest.fn()
}));

describe('Auth Middleware - Ban Logic', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            session: {
                user: { id: 1, username: 'testuser' },
                destroy: jest.fn()
            },
            headers: {},
            xhr: false
        };
        res = {
            redirect: jest.fn(),
            render: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    test('should allow access if user is not banned', async () => {
        UserService.checkBanStatus.mockResolvedValue(null);
        await requireLogin(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.session.destroy).not.toHaveBeenCalled();
    });

    test('should destroy session and show default error if banned without details', async () => {
        UserService.checkBanStatus.mockResolvedValue({ type: 'Banned', until: null });
        await requireLogin(req, res, next);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('pages/auth/login', { error: 'Your account has been banned.' });
    });

    test('should show specific duration message if banned until date', async () => {
        const futureDate = new Date('2025-12-31T23:59:59Z');
        UserService.checkBanStatus.mockResolvedValue({ type: '24hBanned', until: futureDate });
        
        await requireLogin(req, res, next);
        
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('pages/auth/login', { 
            error: expect.stringContaining('Your account has been banned until') 
        });
        expect(res.render).toHaveBeenCalledWith('pages/auth/login', { 
            error: expect.stringContaining(futureDate.toLocaleString()) 
        });
    });

    test('should show permanent ban message if LifeBanned', async () => {
        UserService.checkBanStatus.mockResolvedValue({ type: 'LifeBanned', until: null });
        await requireLogin(req, res, next);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('pages/auth/login', { error: 'Your account has been permanently banned.' });
    });

    test('should return JSON error for API requests', async () => {
        req.xhr = true;
        UserService.checkBanStatus.mockResolvedValue({ type: 'LifeBanned', until: null });
        
        await requireLogin(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
            error: 'Account Banned', 
            details: 'Your account has been permanently banned.' 
        }));
    });
});
