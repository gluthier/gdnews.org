const PostService = require('../../src/services/post-service');
const database = require('../../src/database/database');

jest.mock('../../src/database/database');

describe('PostService', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('getPosts', () => {
        beforeEach(() => {
            database.query.mockResolvedValue([]);
        });

        it('should fetch home posts (defaults)', async () => {
            await PostService.getPosts({});
            
            expect(database.query).toHaveBeenCalledTimes(2); // 1 for posts, 1 for promoted check
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('activity_score DESC');
            expect(callArgs[0]).toContain('LIMIT ? OFFSET ?');
        });

        it('should fetch newest posts', async () => {
            await PostService.getPosts({ type: 'newest' });
            
            expect(database.query).toHaveBeenCalledTimes(1);
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('ORDER BY \n                        CASE \n                          WHEN p.is_promoted = TRUE');
        });

        it('should fetch jobs', async () => {
            await PostService.getPosts({ type: 'jobs' });
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('WHERE p.is_job = TRUE');
        });

        it('should fetch upcoming promoted posts', async () => {
            await PostService.getPosts({ type: 'upcoming' });
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('WHERE p.is_promoted = TRUE AND p.promoted_date > CURRENT_DATE()');
            expect(callArgs[0]).toContain('ORDER BY p.promoted_date ASC');
        });

         it('should fetch user submissions', async () => {
            await PostService.getPosts({ type: 'user_submissions', targetId: 'testuser' });
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('WHERE u.username = ?');
            expect(callArgs[1]).toContain('testuser');
        });

        it('should fetch user favorites', async () => {
            await PostService.getPosts({ type: 'user_favorites', targetId: 'testuser' });
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain('FROM favourites f');
            expect(callArgs[0]).toContain('WHERE target_u.username = ?');
            expect(callArgs[1]).toEqual(['testuser', 31, 0]);
        });

        it('should inject promoted post on first page of home', async () => {
            const mockPromoted = [{ id: 999, title: 'Promoted', is_promoted: true }];
            const mockNormal = [{ id: 1, title: 'Normal' }];

            // First call returns normal posts, second call returns promoted
            database.query
                .mockResolvedValueOnce(mockNormal)
                .mockResolvedValueOnce(mockPromoted);

            const result = await PostService.getPosts({ type: 'home', page: 1 });
            
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(999); // Promoted first
            expect(result[1].id).toBe(1);
        });
    });

    describe('getPostById', () => {
        it('should return post if found', async () => {
            const mockPost = { id: 1, title: 'Test' };
            database.query.mockResolvedValue([mockPost]);

            const result = await PostService.getPostById(1, 123);
            expect(result).toEqual(mockPost);
            expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.id = ?'), [123, 1]);
        });

        it('should return null if not found', async () => {
            database.query.mockResolvedValue([]);
            const result = await PostService.getPostById(999);
            expect(result).toBeNull();
        });
    });

    describe('createPost', () => {
        it('should throw error if title is too long', async () => {
            const postData = {
                userId: 1,
                title: 'a'.repeat(181),
                url: 'http://example.com'
            };

            await expect(PostService.createPost(postData)).rejects.toThrow('Title must be 180 characters or less');
            expect(database.query).toHaveBeenCalledTimes(0); // Title length check is first
        });

        it('should insert new post', async () => {
            const postData = {
                userId: 1,
                title: 'New Post',
                url: 'http://example.com',
                description: 'Content',
                isJob: false,
                isPromoted: false,
                promotedDate: null
            };
            database.query
                .mockResolvedValueOnce([{ email_verified: 0 }]) // User check
                .mockResolvedValueOnce([{ count: 0 }])         // Count check
                .mockResolvedValue({ insertId: 100 });         // Insert

            const result = await PostService.createPost(postData);
            
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO posts'),
                [1, 'New Post', 'http://example.com', 'Content', false, false, null]
            );
            expect(result).toEqual({ insertId: 100 });
            expect(database.query).toHaveBeenCalledTimes(3);
        });
    });

    describe('addComment', () => {
        it('should insert comment', async () => {
            await PostService.addComment({ postId: 1, userId: 2, content: 'Nice', parentCommentId: 5 });
             expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO comments'),
                [1, 2, 'Nice', 5]
            );
        });
    });

    describe('favorite operations', () => {
        it('should favorite', async () => {
            await PostService.favorite(1, 100);
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT IGNORE INTO favourites'),
                [1, 100]
            );
        });

        it('should unfavorite', async () => {
            await PostService.unfavorite(1, 100);
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM favourites'),
                [1, 100]
            );
        });
    });

    describe('checkPromotedCollision', () => {
        it('should return true if collision exists', async () => {
            database.query.mockResolvedValue([{ id: 1 }]);
            const result = await PostService.checkPromotedCollision('2023-01-01');
            expect(result).toBe(true);
        });

        it('should return false if no collision', async () => {
            database.query.mockResolvedValue([]);
            const result = await PostService.checkPromotedCollision('2023-01-01');
            expect(result).toBe(false);
        });

        it('should return false if collision is with a removed post', async () => {
            // This test simulates the DB returning rows (which means the current implementation finds them),
            // but we want the SERVICE to filter them out OR the query to filter them out.
            // Since we are mocking the DB query result, we can't test the SQL query modification directly here 
            // without inspecting the query string passed to database.query.
            // So we will verify that the query string contains the status check.
            
            database.query.mockResolvedValue([]);
            await PostService.checkPromotedCollision('2023-01-01');
            
            const callArgs = database.query.mock.calls[0];
            expect(callArgs[0]).toContain("status != 'removed'");
        });
    });

    describe('getWeeklyLinks', () => {
        it('should execute query', async () => {
            await PostService.getWeeklyLinks();
            expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 7 DAY'));
        });
    });
});
