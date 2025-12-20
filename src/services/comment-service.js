const database = require('../database/database');

/**
 * Helper to fetch comments and build tree
 */
const fetchCommentsForPost = async (postId) => {
    const comments = await database.query(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [postId]);

    // Build comment tree
    const commentMap = {};
    const rootComments = [];

    comments.forEach(comment => {
        comment.children = [];
        commentMap[comment.id] = comment;
    });

    comments.forEach(comment => {
        if (comment.parent_comment_id) {
            if (commentMap[comment.parent_comment_id]) {
                commentMap[comment.parent_comment_id].children.push(comment);
            }
        } else {
            rootComments.push(comment);
        }
    });

    // Helper to count total descendants
    const countDescendants = (comment) => {
        let count = 0;
        if (comment.children && comment.children.length > 0) {
            count += comment.children.length;
            comment.children.forEach(child => {
                count += countDescendants(child);
            });
        }
        return count;
    };

    // Attach descendant counts
    comments.forEach(comment => {
        comment.descendant_count = countDescendants(comment);
    });

    return rootComments;
};

module.exports = {
    fetchCommentsForPost
};
