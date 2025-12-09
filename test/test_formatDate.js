const helpers = require('../src/helpers');

// Mock current date: 2025-12-09T12:00:00 (Noon)
const NOW = new Date('2025-12-09T12:00:00');

// Override Date constructor to return fixed NOW when called without args
const OriginalDate = Date;
global.Date = class extends OriginalDate {
    constructor(...args) {
        if (args.length === 0) return new OriginalDate(NOW);
        return new OriginalDate(...args);
    }
    static now() {
        return NOW.getTime();
    }
};

const testCases = [
    { desc: '10 minutes ago', date: '2025-12-09T11:50:00', expected: '10 minutes ago' },
    { desc: '1 hour 59 minutes ago', date: '2025-12-09T10:01:00', expected: '119 minutes ago' },
    // Same day >= 2 hours
    { desc: '2 hours ago (10:00)', date: '2025-12-09T10:00:00', expected: '10:00:00 AM' },
    { desc: 'Early morning same day (01:00)', date: '2025-12-09T01:00:00', expected: '01:00:00 AM' },

    // Yesterday (should be 1 day ago)
    { desc: 'Yesterday identical time', date: '2025-12-08T12:00:00', expected: '1 day ago' },
    { desc: '2 days ago', date: '2025-12-07T12:00:00', expected: '2 days ago' },

    // < 1 month (Assuming 30 days roughly, but prompt says "number of days... if less than a month ago")
    // Let's interpret "month" as ~30 days or calendar month difference.
    // Prompt: < 1 month: days ago. 
    // Let's try 29 days ago.
    { desc: '29 days ago', date: '2025-11-10T12:00:00', expected: '29 days ago' },

    // 1 month ago (should switch to months)
    { desc: '1 month ago', date: '2025-11-09T12:00:00', expected: '1 month ago' },
    { desc: '2 months ago', date: '2025-10-09T12:00:00', expected: '2 months ago' },
    { desc: '11 months ago', date: '2025-01-09T12:00:00', expected: '11 months ago' },

    // 1 year ago
    { desc: '1 year ago', date: '2024-12-09T12:00:00', expected: '1 year ago' },
    { desc: '2 years ago', date: '2023-12-09T12:00:00', expected: '2 years ago' }
];

console.log('Running formatDate tests...\n');
let passed = 0;
testCases.forEach(tc => {
    const result = helpers.formatDate(tc.date);
    // Note: Local time string format depends on locale. I'll rely on loose matching for time or visual check.
    // For automated check, I'll log the output.
    console.log(`Test: ${tc.desc}`);
    console.log(`  Input: ${tc.date}`);
    console.log(`  Expected: ${tc.expected} (approx)`);
    console.log(`  Actual:   ${result}`);

    // Simple heuristic check
    let isPass = false;
    if (tc.desc.includes('minutes ago') && result.includes('minutes ago')) isPass = true;
    else if (tc.desc.includes('Same day') && result.match(/\d{1,2}:\d{2}:\d{2}/)) isPass = true;
    else if (tc.desc.includes('days ago') && result.includes('day')) isPass = true;
    else if (tc.desc.includes('months ago') && result.includes('month')) isPass = true;
    else if (tc.desc.includes('years ago') && result.includes('year')) isPass = true;

    if (isPass) {
        console.log('  Result: PASS');
        passed++;
    } else {
        console.log('  Result: FAIL (Check manually if locale differs)');
    }
    console.log('---');
});

console.log(`\nPassed ${passed}/${testCases.length} basic checks.`);
