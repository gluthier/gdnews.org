document.addEventListener('DOMContentLoaded', () => {
    const tiers = document.querySelectorAll('.pricing-tier');
    const input = document.getElementById('pricing_tier');

    const selectTier = (value) => {
        tiers.forEach(t => {
            if (t.dataset.value === value) {
                t.classList.add('selected');
            } else {
                t.classList.remove('selected');
            }
        });
        input.value = value;
    };

    tiers.forEach(tier => {
        tier.addEventListener('click', () => {
            selectTier(tier.dataset.value);
        });
    });

    // Initial selection if pricing_tier is provided from session/error
    if (input.value) {
        selectTier(input.value);
    }
});
