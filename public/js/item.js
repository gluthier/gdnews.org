/**
 * Handles showing the reply form and toggling visibility of sibling elements.
 * @param {string} commentId - The ID of the comment.
 * @param {HTMLElement} replyBtn - The button element that triggered the action.
 */
function showReply(commentId, replyBtn) {
    const replyForm = document.getElementById('reply-' + commentId);
    if (replyForm) replyForm.style.display = 'block';

    const contentDiv = document.getElementById('content-' + commentId);
    const childrenDiv = document.getElementById('children-' + commentId);
    const hideBtn = replyBtn.previousElementSibling;

    if (contentDiv && contentDiv.style.display === 'none') {
        contentDiv.style.display = 'block';
        if (childrenDiv) childrenDiv.style.display = 'block';
        if (hideBtn) hideBtn.innerText = 'hide';
    }
}

/**
 * Toggles the visibility of child comments.
 * @param {string} commentId - The ID of the comment.
 * @param {HTMLElement} btn - The button element that triggered the action.
 * @param {number} count - The number of descendants.
 */
function toggleChildren(commentId, btn, count) {
    const childrenDiv = document.getElementById('children-' + commentId);
    const contentDiv = document.getElementById('content-' + commentId);
    const replyForm = document.getElementById('reply-' + commentId);

    if (childrenDiv.style.display === 'none') {
        childrenDiv.style.display = 'block';
        if (contentDiv) contentDiv.style.display = 'block';
        btn.innerText = 'hide';
    } else {
        childrenDiv.style.display = 'none';
        if (contentDiv) contentDiv.style.display = 'none';
        if (replyForm) replyForm.style.display = 'none';
        if (count > 0) {
            btn.innerText = 'show (' + (count + 1) + ')';
        } else {
            btn.innerText = 'show';
        }
    }
}

/**
 * Escapes HTML characters and normalizes newlines to two newlines per paragraph.
 * @param {string} text - The text to format.
 * @returns {string} - The formatted HTML string.
 */
function formatCommentContent(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\r\n/g, '\n')
        .replace(/\n+/g, '\n\n');
}

/**
 * Renders a new comment into the DOM after successful submission.
 * @param {Object} comment - The comment object returned from the server.
 */
function renderNewComment(comment) {
    const commentHtml = `
        <div class="comment">
            <div class="comment-meta">
                ${comment.username}
                ${new Date(comment.created_at).toLocaleString()}
                <button onclick="toggleChildren('${comment.id}', this, 0)">hide</button>
                <button onclick="showReply('${comment.id}', this)">reply</button>
            </div>
            <div class="comment-content" id="content-${comment.id}">${formatCommentContent(comment.content)}</div>

            <div id="reply-${comment.id}" style="display: none; margin-top: 10px;">
                <form action="/item/${comment.post_id}/comment" method="POST">
                    <input type="hidden" name="parent_comment_id" value="${comment.id}">
                    <textarea name="content" rows="2" cols="50" required></textarea><br>
                    <button type="submit">submit reply</button>
                    <button type="button" onclick="document.getElementById('reply-${comment.id}').style.display = 'none'">cancel</button>
                </form>
            </div>

            <div id="children-${comment.id}"></div>
        </div>
    `;

    if (comment.parent_comment_id) {
        const parentChildrenDiv = document.getElementById('children-' + comment.parent_comment_id);
        if (parentChildrenDiv) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = commentHtml;
            parentChildrenDiv.appendChild(tempDiv.firstElementChild);
            parentChildrenDiv.style.display = 'block'; // Ensure children are visible
        }
    } else {
        const commentsDiv = document.querySelector('.comments');
        // If commentsDiv is not found, fallback to appending to a safe location or log error
        if (commentsDiv) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = commentHtml;
            commentsDiv.appendChild(tempDiv.firstElementChild);
        } else {
            console.error('Comments container not found');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('submit', async (e) => {
        if (e.target.tagName === 'FORM' && e.target.action.includes('/comment')) {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.innerText = 'Submitting...';

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: new URLSearchParams(formData),
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (response.ok) {
                    const newComment = await response.json();
                    renderNewComment(newComment);
                    form.reset();
                    if (newComment.parent_comment_id) {
                        const replyFormDiv = document.getElementById('reply-' + newComment.parent_comment_id);
                        if (replyFormDiv) replyFormDiv.style.display = 'none';
                    }
                } else {
                    console.error('Submission failed');
                    alert('Failed to submit comment. Please try again.');
                }
            } catch (err) {
                console.error('Error:', err);
                alert('An error occurred. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
            }
        }
    });
});
