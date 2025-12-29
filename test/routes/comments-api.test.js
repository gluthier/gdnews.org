const request = require('supertest');
const UserService = require('../../src/services/user-service');
const CommentService = require('../../src/services/comment-service');
const PostService = require('../../src/services/post-service');

// Mocks
jest.mock('../../src/database/database', () => ({
    getConnection: jest.fn(),
    query: jest.fn(),
    close: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/services/user-service');
jest.mock('../../src/services/comment-service');
jest.mock('../../src/services/post-service');
jest.mock('bcrypt', () => ({
    compare: jest.fn().mockResolvedValue(true) // Always verify password
}));

const app = require('../../src/server');

describe('Comment Removal API', () => {
    let csrfToken;
    let agent;

    beforeEach(async () => {
        jest.clearAllMocks();
        agent = request.agent(app);
        
        // Setup Login
        UserService.getUserByUsername.mockResolvedValue({
            id: 1, 
            username: 'testuser', 
            password_hash: 'hashed',
            user_type: 'user'
        });
        
        // Get CSRF
        const loginPage = await agent.get('/auth/login');
        const match = loginPage.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match ? match[1] : '';

        // Perform Login
        await agent
            .post('/auth/login')
            .type('form')
            .send({
                username: 'testuser',
                password: 'password',
                _csrf: csrfToken
            });
            
        // Get new CSRF after login
        const homePage = await agent.get('/');
         const match2 = homePage.text.match(/name="_csrf" value="([^"]+)"/);
        csrfToken = match2 ? match2[1] : csrfToken;
    });

    test('Standard request redirects back', async () => {
        CommentService.getCommentById.mockResolvedValue({
            id: 10,
            user_id: 1, // Same as logged in user
            content: 'Test comment'
        });
        CommentService.deleteComment.mockResolvedValue(true);

        const res = await agent
            .post('/post/item/100/comment/10/remove')
            .type('form')
            .send({ _csrf: csrfToken });

        expect(res.statusCode).toBe(302);
        expect(res.header['location']).toContain('/post/item/100');
        expect(CommentService.deleteComment).toHaveBeenCalledWith('10');
    });

    test('AJAX request returns JSON success', async () => {
        CommentService.getCommentById.mockResolvedValue({
            id: 10,
            user_id: 1,
            content: 'Test comment'
        });
        CommentService.deleteComment.mockResolvedValue(true);

        const res = await agent
            .post('/post/item/100/comment/10/remove')
            .set('X-Requested-With', 'XMLHttpRequest')
            .set('Accept', 'application/json')
            .send({ _csrf: csrfToken });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: 'success' });
        expect(CommentService.deleteComment).toHaveBeenCalledWith('10');
    });
    
    test('Unauthorized AJAX request', async () => {
         CommentService.getCommentById.mockResolvedValue({
            id: 10,
            user_id: 2, // Different user
            content: 'Test comment'
        });

        const res = await agent
            .post('/post/item/100/comment/10/remove')
            .set('X-Requested-With', 'XMLHttpRequest')
            .set('Accept', 'application/json')
            .send({ _csrf: csrfToken });

        expect(res.statusCode).toBe(403);
    });

    test('Error in AJAX request returns JSON error', async () => {
        CommentService.getCommentById.mockResolvedValue({
            id: 10,
            user_id: 1,
            content: 'Test comment'
        });
        CommentService.deleteComment.mockRejectedValue(new Error('Database error'));

        const res = await agent
            .post('/post/item/100/comment/10/remove')
            .set('X-Requested-With', 'XMLHttpRequest')
            .set('Accept', 'application/json')
            .send({ _csrf: csrfToken });

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: 'Deletion failed' });
    });
});
