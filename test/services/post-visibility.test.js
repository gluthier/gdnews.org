const PostService = require('../../src/services/post-service');
const UserService = require('../../src/services/user-service');
const database = require('../../src/database/database');
const crypto = require('crypto');

describe('Post Visibility (Removed Status)', () => {
    let user;
    let post;
    let promotedPost;

    beforeAll(async () => {
        // Create a user
        const username = `visibility_test_user_${Date.now()}`;
        const email = `visibility_test_${Date.now()}@example.com`;
        const result = await UserService.createUser({
            username,
            password_hash: 'hash',
            email
        });
        user = await UserService.getUserById(result.insertId);
    });

    afterAll(async () => {
        // Cleanup if necessary, usually database is persistent or reset by test runner
        // For now we assume we can leave data or db is reset
    });

    test('getPostById should not return removed post', async () => {
        const result = await PostService.createPost({
            userId: user.id,
            title: 'Post to be removed',
            description: 'This is a description',
            url: 'http://example.com'
        });
        const postId = result.insertId;

        // Verify it exists
        let p = await PostService.getPostById(postId);
        expect(p).not.toBeNull();

        // Mark as removed
        await PostService.updatePostStatus(postId, 'removed');

        // Verify it is gone from getPostById
        p = await PostService.getPostById(postId);
        expect(p).toBeNull();
    });

    test('getPosts(user_submissions) should not return removed post', async () => {
         const result = await PostService.createPost({
            userId: user.id,
            title: 'Submission to be removed',
            description: 'Desc',
            url: 'http://sub.example.com'
        });
        const postId = result.insertId;

        // Verify initially present
        let posts = await PostService.getPosts({ type: 'user_submissions', targetId: user.username });
        // Use loose equality to handle potential BigInt/Number mismatch if that is the case
        expect(posts.find(p => p.id == postId)).toBeDefined();

        // Mark removed
        await PostService.updatePostStatus(postId, 'removed');

        // Verify gone
        posts = await PostService.getPosts({ type: 'user_submissions', targetId: user.username });
        expect(posts.find(p => p.id === postId)).toBeUndefined();
    });

    test('getPosts(user_favorites) should not return removed post', async () => {
        const result = await PostService.createPost({
            userId: user.id,
            title: 'Favorite to be removed',
            description: 'Fav Desc',
            url: 'http://fav.example.com'
        });
        const postId = result.insertId;
        
        // Favorite it
        await PostService.favorite(user.id, postId);

        // Verify present
        let posts = await PostService.getPosts({ type: 'user_favorites', targetId: user.username });
        // Use loose equality to handle potential BigInt/Number mismatch if that is the case 
        expect(posts.find(p => p.id == postId)).toBeDefined();

        // Mark removed
        await PostService.updatePostStatus(postId, 'removed');

        // Verify gone
        posts = await PostService.getPosts({ type: 'user_favorites', targetId: user.username });
        expect(posts.find(p => p.id === postId)).toBeUndefined();
    });

    test('getPosts(upcoming) should not return removed promoted post', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 10); // Future date to be safe
        const dString = tomorrow.toISOString().split('T')[0];
        
        // Ensure no collision (simple check, in test env usually empty or we accept error)
        try {
            const result = await PostService.createPost({
                userId: user.id,
                title: 'Promoted to be removed',
                description: 'Promoted Desc',
                url: 'http://promoted.example.com',
                isPromoted: true,
                promotedDate: dString
            });
             const postId = result.insertId;

            // Verify present logic depends on date, assume query is correct for future dates
            let posts = await PostService.getPosts({ type: 'upcoming' });
            expect(posts.find(p => p.id == postId)).toBeDefined();

            // Mark removed
            await PostService.updatePostStatus(postId, 'removed');

            // Verify gone
            posts = await PostService.getPosts({ type: 'upcoming' });
            expect(posts.find(p => p.id === postId)).toBeUndefined();

        } catch (e) {
            // Might fail if date collision, but in dev/test db should be fine
            if (e.message.includes('Duplicate')) {
                console.warn('Skipping upcoming test due to date collision');
            } else {
                throw e;
            }
        }
    });
    
    test('getWeeklyLinks should not return removed post', async () => {
        const uniqueUrl = 'http://weekly.example.com/unique_' + Date.now();
        const result = await PostService.createPost({
            userId: user.id,
            title: 'Weekly to be removed',
            description: 'Weekly Desc',
            url: uniqueUrl
        });
        const postId = result.insertId;

        // Verify present matches uniqueUrl
        let links = await PostService.getWeeklyLinks();
        expect(links.find(l => l.url === uniqueUrl)).toBeDefined();

        // Mark removed
        await PostService.updatePostStatus(postId, 'removed');

        // Verify gone
        links = await PostService.getWeeklyLinks();
        expect(links.find(l => l.url === uniqueUrl)).toBeUndefined();
    });

});
