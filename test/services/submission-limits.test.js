const PostService = require('../../src/services/post-service');
const database = require('../../src/database/database');

jest.mock('../../src/database/database');

describe('PostService Submission Limits', () => {
    const userId = 1;

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('checkSubmissionLimit', () => {
        it('should allow submission if under limit (unverified)', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 0 }]) // User check
                .mockResolvedValueOnce([{ count: 4 }]);         // Count check

            await expect(PostService.checkSubmissionLimit(userId, false)).resolves.not.toThrow();
        });

        it('should throw error if at limit (unverified)', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 0 }]) // User check
                .mockResolvedValueOnce([{ count: 5 }]);         // Count check

            await expect(PostService.checkSubmissionLimit(userId, false)).rejects.toThrow(
                'Daily limit reached. You can submit up to 5 posts per day because your email is not validated.'
            );
        });

        it('should allow submission if under limit (verified)', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 1 }]) // User check
                .mockResolvedValueOnce([{ count: 9 }]);         // Count check

            await expect(PostService.checkSubmissionLimit(userId, false)).resolves.not.toThrow();
        });

        it('should throw error if at limit (verified)', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 1 }]) // User check
                .mockResolvedValueOnce([{ count: 10 }]);        // Count check

            await expect(PostService.checkSubmissionLimit(userId, false)).rejects.toThrow(
                'Daily limit reached. You can submit up to 10 posts per day because your email is validated.'
            );
        });

        it('should show correct message for jobs', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 0 }]) // User check
                .mockResolvedValueOnce([{ count: 5 }]);         // Count check

            await expect(PostService.checkSubmissionLimit(userId, true)).rejects.toThrow(
                'Daily limit reached. You can submit up to 5 jobs per day because your email is not validated.'
            );
        });
    });

    describe('createPost integration', () => {
        it('should call checkSubmissionLimit and then insert', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 1 }]) // User check
                .mockResolvedValueOnce([{ count: 0 }])         // Count check
                .mockResolvedValueOnce({ insertId: 123 });     // Insert

            const result = await PostService.createPost({
                userId,
                title: 'Test Post',
                url: 'http://example.com'
            });

            expect(result.insertId).toBe(123);
            expect(database.query).toHaveBeenCalledTimes(3);
        });

        it('should not insert if checkSubmissionLimit fails', async () => {
            database.query
                .mockResolvedValueOnce([{ email_verified: 0 }]) // User check
                .mockResolvedValueOnce([{ count: 5 }]);         // Count check

            await expect(PostService.createPost({
                userId,
                title: 'Test Post'
            })).rejects.toThrow(/Daily limit reached/);

            expect(database.query).toHaveBeenCalledTimes(2); // Should not have called dynamic insert
        });

        it('should skip limit check if skipLimitCheck is true', async () => {
             database.query
                .mockResolvedValueOnce({ insertId: 123 });     // Insert

            await expect(PostService.createPost({
                userId,
                title: 'Test Post',
                url: 'http://example.com',
                skipLimitCheck: true
            })).resolves.not.toThrow();

            // Should have called insert, but NOT the user check or count check
            // However, depending on implementation detail of checkSubmissionLimit, 
            // the cleanest check is that it DID NOT fail even though we didn't mock the limit check queries.
            // But to be precise, createPost calls checkSubmissionLimit if !skipLimitCheck.
            // If skipLimitCheck is true, it proceeds to insert.
            // Insert is the 1st call in this scenario because user/count checks are skipped.
            expect(database.query).toHaveBeenCalledTimes(1); 
        });
    });
});
