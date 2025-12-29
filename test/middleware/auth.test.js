jest.mock('../../src/services/user-service', () => ({
    checkBanStatus: jest.fn().mockResolvedValue(null)
}));

const requireLogin = require('../../src/middleware/auth');

describe('Auth Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            session: {},
            headers: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            redirect: jest.fn()
        };
        next = jest.fn();
    });

    describe('Authenticated User', () => {
        test('calls next() when user is logged in', async () => {
            req.session.user = { id: 1, username: 'testuser' };
            await requireLogin(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.redirect).not.toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('Unauthenticated User', () => {
        test('redirects to /auth/login for standard requests', () => {
            requireLogin(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/auth/login');
            expect(next).not.toHaveBeenCalled();
        });

        test('returns 401 JSON for XHR requests', () => {
            req.xhr = true;
            requireLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
            expect(res.redirect).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        test('returns 401 JSON for requests accepting JSON', () => {
            req.headers.accept = 'application/json';
            requireLogin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
            expect(res.redirect).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });
        
        test('returns 401 JSON for requests accepting application/vnd.api+json', () => {
             req.headers.accept = 'application/vnd.api+json';
             requireLogin(req, res, next);
             expect(res.status).toHaveBeenCalledWith(401);
             expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
             expect(res.redirect).not.toHaveBeenCalled();
             expect(next).not.toHaveBeenCalled();
        });
    });
});
