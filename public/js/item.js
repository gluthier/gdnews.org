


/**
 * Renders a new comment into the DOM after successful submission.
 * @param {string} commentHtml - The comment HTML string returned from the server.
 * @param {Object|null} parentId - The ID of the parent comment, if any (extracted from the form or response, but here we might need to parse it or pass it separately. 
 */
function renderNewComment(commentHtml, parentId) {
    let container;
    if (parentId) {
        const parentChildrenDiv = document.getElementById('children-' + parentId);
        if (parentChildrenDiv) {
            container = parentChildrenDiv;
            parentChildrenDiv.style.display = 'block'; // Ensure children are visible
        }
    } else {
        container = document.querySelector('.comments');
    }

    if (container) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = commentHtml;
        const newCommentArg = tempDiv.firstElementChild;
        if (newCommentArg) {
            container.appendChild(newCommentArg);
            newCommentArg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        console.error('Comments container not found');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('submit', async (e) => {
        if (e.target.tagName === 'FORM' && e.target.action.includes('/post/item/') && e.target.action.includes('/comment')) {
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
                    const newCommentHtml = await response.text();
                    const parentId = formData.get('parent_comment_id');
                    renderNewComment(newCommentHtml, parentId);
                    form.reset();
                    if (parentId) {
                        const replyFormDiv = document.getElementById('reply-' + parentId);
                        if (replyFormDiv) replyFormDiv.style.display = 'none';
                    }
                } else if (response.status === 401) {
                    window.location.href = '/auth/login';
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

    document.body.addEventListener('click', async (e) => {
        const target = e.target;

        // Toggle children visibility (hide/show)
        if (target.classList.contains('toggle-children-btn')) {
            const commentId = target.dataset.commentId;
            const count = parseInt(target.dataset.count, 10);
            const childrenDiv = document.getElementById('children-' + commentId);
            const contentDiv = document.getElementById('content-' + commentId);
            const replyForm = document.getElementById('reply-' + commentId);

            if (childrenDiv.style.display === 'none') {
                childrenDiv.style.display = 'block';
                if (contentDiv) contentDiv.style.display = 'block';
                target.innerText = 'hide';
            } else {
                childrenDiv.style.display = 'none';
                if (contentDiv) contentDiv.style.display = 'none';
                if (replyForm) replyForm.style.display = 'none';
                if (count > 0) {
                    target.innerText = 'show (' + (count + 1) + ')';
                } else {
                    target.innerText = 'show';
                }
            }
        }

        // Show reply form
        if (target.classList.contains('show-reply-btn')) {
            const commentId = target.dataset.commentId;
            const replyForm = document.getElementById('reply-' + commentId);
            if (replyForm) replyForm.style.display = 'block';

            const contentDiv = document.getElementById('content-' + commentId);
            const childrenDiv = document.getElementById('children-' + commentId);
            
            // Re-syncing logic similar to showReply but using the new structure
            if (contentDiv && contentDiv.style.display === 'none') {
                contentDiv.style.display = 'block';
                if (childrenDiv) childrenDiv.style.display = 'block';
                const hideBtn = target.parentElement.parentElement.querySelector('.toggle-children-btn');
                if (hideBtn) hideBtn.innerText = 'hide';
            }
        }

        // Cancel reply form
        if (target.classList.contains('cancel-reply-btn')) {
            const commentId = target.dataset.commentId;
            const replyForm = document.getElementById('reply-' + commentId);
            if (replyForm) replyForm.style.display = 'none';
        }

        // Show more comments
        if (target.classList.contains('show-more-btn')) {
            const hiddenDiv = target.nextElementSibling;
            if (hiddenDiv) {
                hiddenDiv.style.display = 'block';
                target.style.display = 'none';
            }
        }

        if (target.matches('a.confirm-action')) {
            e.preventDefault();
            const link = e.target;
            if (link.dataset.confirmed !== 'true') {
                link.innerText = 'confirm remove';
                link.style.color = '#eb0808'; // @color-error
                link.dataset.confirmed = 'true';
            } else {
                const originalText = link.innerText;
                link.innerText = 'removing...';
                
                try {
                    const response = await fetch(link.href, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: `_csrf=${link.dataset.csrf}`
                    });

                    if (response.redirected) {
                         window.location.href = response.url;
                    } else if (response.ok) {
                         window.location.reload(); 
                    } else {
                        console.error('Removal failed');
                         alert('Failed to remove item.');
                         link.innerText = originalText;
                    }

                } catch (err) {
                    console.error('Error:', err);
                    alert('An error occurred.');
                    link.innerText = originalText;
                }
            }
        }
    });

    // Handle clicks on comment date links to avoid hard jump
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.hash && link.hash.startsWith('#comment-') && 
            link.pathname === window.location.pathname) {
            
            e.preventDefault();
            
            // Push state only if it changes
            if (window.location.hash !== link.hash) {
                history.pushState(null, '', link.hash);
            }
            
            handleDeepLink();
        }
    });
    
    function handleDeepLink() {
        // Remove existing highlights
        document.querySelectorAll('.target-highlight').forEach(el => {
            el.classList.remove('target-highlight');
        });

        const hash = window.location.hash;
        if (hash && hash.startsWith('#comment-')) {
            const targetId = hash.substring(1); // 'comment-123'
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                // Apply highlight class
                targetElement.classList.add('target-highlight');

                // Walk up the DOM to find any hidden parent containers (e.g. from 'show more')
                let current = targetElement;
                while (current && current !== document.body) {
                    // Check if this element is a hidden container controlled by show-more
                    // The structure is usually button.show-more-btn + div(hidden)
                    if (current.style.display === 'none' && current.parentElement.classList.contains('show-more')) {
                         current.style.display = 'block';
                         const btn = current.parentElement.querySelector('.show-more-btn');
                         if (btn) btn.style.display = 'none';
                    }
                    
                    // Also check for the children-{id} container which might be hidden by "toggle children"
                    // Structure: div.comment -> div.meta -> ul -> li -> button.toggle-children-btn
                    // The container we are inside is div#children-{id}
                    if (current.id && current.id.startsWith('children-') && current.style.display === 'none') {
                         current.style.display = 'block';
                         // Find the button that controls this
                         const commentId = current.id.replace('children-', '');
                         const toggleBtn = document.querySelector(`.toggle-children-btn[data-comment-id="${commentId}"]`);
                         if (toggleBtn) {
                             toggleBtn.innerText = 'hide';
                         }
                    }

                    current = current.parentElement;
                }
                
                // Smart scroll: only scroll if not in viewport
                const rect = targetElement.getBoundingClientRect();
                const isInViewport = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );

                if (!isInViewport) {
                    setTimeout(() => {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        }
    }

    // Run on load
    handleDeepLink();
    
    // Run on hash change (e.g. clicking links on the same page)
    window.addEventListener('hashchange', handleDeepLink);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            // Remove highlight class manually
            document.querySelectorAll('.target-highlight').forEach(el => {
                el.classList.remove('target-highlight');
            });
            // Remove hash without scrolling
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    });
});
