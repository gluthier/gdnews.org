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
        if (comment.is_removed) {
            comment.content = '[removed]';
            comment.username = '[removed]';
        }
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

/**
 * Get all comments with pagination
 * @param {Object} options
 */
const getAllComments = async ({ page = 1, limit = 50 }) => {
    const offset = (page - 1) * limit;
    const comments = await database.query(`
        SELECT c.*, u.username, p.title as post_title 
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        JOIN posts p ON c.post_id = p.id 
        ORDER BY c.created_at DESC 
        LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countResult = await database.query('SELECT COUNT(*) as count FROM comments');
    
    comments.forEach(comment => {
        if (comment.is_removed) {
            comment.content = '[removed]';
            comment.username = '[removed]';
        }
    });

    return {
        comments,
        count: Number(countResult[0].count)
    };
};

/**
 * Get comment by ID
 * @param {number} id 
 */
const getCommentById = async (id) => {
    const comments = await database.query(
        'SELECT * FROM comments WHERE id = ?',
        [id]
    );
    return comments.length > 0 ? comments[0] : null;
};

/**
 * Soft delete a comment
 * @param {number} id 
 */
const deleteComment = async (id) => {
    console.log(`Deleting comment ${id}`);
    const result = await database.query(
        'UPDATE comments SET is_removed = 1 WHERE id = ?',
        [id]
    );
    console.log('Delete result:', result);
    return result;
};

/**
 * Update comment content
 * @param {number} id 
 * @param {string} content 
 */
const updateComment = async (id, content) => {
    return await database.query(
        'UPDATE comments SET content = ? WHERE id = ?',
        [content, id]
    );
};

/**
 * Get total comment count
 */
const getCommentCount = async () => {
    const countResult = await database.query('SELECT COUNT(*) as count FROM comments');
    return Number(countResult[0].count);
};

module.exports = {
    fetchCommentsForPost,
    getAllComments,
    getCommentCount,
    getCommentById,
    deleteComment,
    updateComment
};
