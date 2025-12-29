document.addEventListener('DOMContentLoaded', () => {
    // Handle Ban Duration Selection
    document.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('ban-select')) {
            const select = e.target;
            // Traverse up to the action list to find the sibling link
            const container = select.closest('.comment-actions');
            if (container) {
                const link = container.querySelector('.ban-confirm-link');
                if (link) {
                    link.style.display = select.value ? 'inline-block' : 'none';
                }
            }
        }
    });

    // Handle Ban Confirmation Click
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('ban-confirm-link')) {
            e.preventDefault();
            const link = e.target;
            // Traverse up to the action list to find the form
            const container = link.closest('.comment-actions');
            if (container) {
                const form = container.querySelector('form.ban-form');
                if (form) {
                    form.submit();
                }
            }
        }
    });
});
