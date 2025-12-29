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

    // Handle Ban Confirmation Click
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('ban-confirm-button')) {
            e.preventDefault();
            const btn = e.target;
            // Traverse up to the action list to find the form
            const container = btn.closest('.moderation-actions');
            if (container) {
                const form = container.querySelector('form.ban-form');
                if (form) {
                    form.submit();
                }
            }
        }
    });
});
