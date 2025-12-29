document.addEventListener('DOMContentLoaded', () => {
    // Handle Ban Duration Selection
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('ban-select')) {
            const select = e.target;
            // Since the button is now inside the same form, finding it is much safer
            const form = select.closest('form');
            const btn = form.querySelector('.ban-confirm-button');
            if (btn) {
                btn.style.display = select.value ? 'inline-block' : 'none';
            }
        }
    });

    // Handle View Parent Comment Click
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('view-parent-comment')) {
            e.preventDefault();
            const link = e.target;
            const commentId = link.dataset.commentId;
            
            const metaDiv = link.closest('.comment-meta');
            const previewDiv = metaDiv.querySelector('.parent-comment-preview') || metaDiv.nextElementSibling;
            
            if (!previewDiv || !previewDiv.classList.contains('parent-comment-preview')) {
                console.error('Preview container not found');
                return;
            }

            if (previewDiv.style.display !== 'none') {
                previewDiv.style.display = 'none';
                return;
            }

            // If already loaded, just show
            if (previewDiv.dataset.loaded === 'true') {
                previewDiv.style.display = 'block';
                return;
            }

            previewDiv.innerHTML = 'Loading...';
            previewDiv.style.display = 'block';

            try {
                const response = await fetch(`/moderation/api/comment/${commentId}`);
                if (!response.ok) throw new Error('Failed to load comment');
                const data = await response.json();
                
                const content = data.is_removed ? '[removed]' : data.content;
                const username = data.username || '[removed]';
                
                previewDiv.innerHTML = `
                    <div style="font-size: 0.9em; margin-bottom: 5px;">
                        <strong><a href="/user/${username}">${username}</a></strong> said:
                    </div>
                    <div>${content}</div>
                `;
                previewDiv.dataset.loaded = 'true';
            } catch (err) {
                previewDiv.innerHTML = `<span style="color: red;">Error: ${err.message}</span>`;
            }
        }
    });
});
