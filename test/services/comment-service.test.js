const CommentService = require('../../src/services/comment-service');
const database = require('../../src/database/database');

jest.mock('../../src/database/database');

describe('CommentService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchCommentsForPost', () => {
        it('should fetch comments tree', async () => {
            const comments = [
                { id: 1, content: 'Root', parent_comment_id: null },
                { id: 2, content: 'Child', parent_comment_id: 1 }
            ];
            database.query.mockResolvedValue(comments);

            const result = await CommentService.fetchCommentsForPost(1);
            
            // Should return root comments with children populated
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
            expect(result[0].children).toHaveLength(1);
            expect(result[0].children[0].id).toBe(2);
            
            expect(database.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT c.*, u.username'),
                [1]
            );
        });

        it('should return empty array if no comments', async () => {
             database.query.mockResolvedValue([]);
             const result = await CommentService.fetchCommentsForPost(1);
             expect(result).toEqual([]);
        });
    });
});
