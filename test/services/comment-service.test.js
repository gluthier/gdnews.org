const CommentService = require('../../src/services/comment-service');
const database = require('../../src/database/database');

jest.mock('../../src/database/database');

describe('CommentService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchCommentsForPost', () => {
        it('should fetch comments and build a nested tree structure', async () => {
            const mockComments = [
                { id: 1, content: 'Root 1', parent_comment_id: null, user_id: 1, created_at: new Date() },
                { id: 2, content: 'Child 1', parent_comment_id: 1, user_id: 2, created_at: new Date() },
                { id: 3, content: 'Child 2', parent_comment_id: 1, user_id: 3, created_at: new Date() },
                { id: 4, content: 'Grandchild 1', parent_comment_id: 2, user_id: 1, created_at: new Date() },
                { id: 5, content: 'Root 2', parent_comment_id: null, user_id: 4, created_at: new Date() }
            ];

            database.query.mockResolvedValue(mockComments);

            const result = await CommentService.fetchCommentsForPost(123);

            expect(database.query).toHaveBeenCalledWith(expect.stringContaining('SELECT c.*, u.username'), [123]);
            
            // Should have 2 root comments
            expect(result).toHaveLength(2);
            
            // sort roots by id to ensure order for assertion
            result.sort((a, b) => a.id - b.id);

            // Check Root 1
            expect(result[0].id).toBe(1);
            expect(result[0].children).toHaveLength(2); // Child 1, Child 2
            expect(result[0].descendant_count).toBe(3); // Child 1 + Child 2 + Grandchild 1

            // Check children of Root 1
            const child1 = result[0].children.find(c => c.id === 2);
            const child2 = result[0].children.find(c => c.id === 3);

            expect(child1).toBeDefined();
            expect(child1.children).toHaveLength(1); // Grandchild 1
            expect(child1.descendant_count).toBe(1);

            expect(child2).toBeDefined();
            expect(child2.children).toHaveLength(0);
            expect(child2.descendant_count).toBe(0);

            // Check Root 2
            expect(result[1].id).toBe(5);
            expect(result[1].children).toHaveLength(0);
            expect(result[1].descendant_count).toBe(0);
        });

        it('should return empty array if no comments found', async () => {
            database.query.mockResolvedValue([]);
            const result = await CommentService.fetchCommentsForPost(999);
            expect(result).toEqual([]);
        });

        it('should handle orphaned comments properly (ignore them or handle gracefully)', async () => {
            // Logic is: if parent not found in map, it won't be pushed to children. 
            // Query only fetches comments for specific post_id so orphaned from other posts won't appear.
            // But if integrity is broken within post (parent missing), let's see current logic:
            // "if (commentMap[comment.parent_comment_id])" -> ignores if parent missing.
            
            const mockComments = [
                { id: 2, content: 'Orphan', parent_comment_id: 999, user_id: 1 } // parent 999 doesn't exist
            ];
             database.query.mockResolvedValue(mockComments);

             const result = await CommentService.fetchCommentsForPost(1);
             // Should return empty because it's not a root (has parentId) and parent not found
             expect(result).toEqual([]);
        });
    });
});
