const helpers = require('../src/helpers');

describe('Helper Functions', () => {
    describe('formatDate', () => {
        beforeAll(() => {
            // Mock current date: 2025-12-09T12:00:00 (Noon)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-09T12:00:00'));
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        const testCases = [
            { desc: '10 minutes ago', date: '2025-12-09T11:50:00', expected: '10 minutes ago' },
            { desc: '1 hour 59 minutes ago', date: '2025-12-09T10:01:00', expected: '119 minutes ago' },
            // Logic in helper for "minutes < 120" returns "X minutes ago", but then "hours < 24" returns "X hours ago".
            // Wait, looking at src/helpers.js:
            // if (minutes < 120) return `... minutes ago`
            // So 119 minutes is indeed "119 minutes ago".
            
            // 2 hours ago
            { desc: '2 hours ago', date: '2025-12-09T10:00:00', expected: '2 hours ago' },
            { desc: 'Early morning same day', date: '2025-12-09T01:00:00', expected: '11 hours ago' },

            // Yesterday
            { desc: 'Yesterday same time', date: '2025-12-08T12:00:00', expected: '1 day ago' },
            { desc: '2 days ago', date: '2025-12-07T12:00:00', expected: '2 days ago' },

            // Days < 30
            { desc: '29 days ago', date: '2025-11-10T12:00:00', expected: '29 days ago' },

            // Months < 12 (logic is days < 365)
            // 30 days ago -> 1 month
            { desc: '1 month ago', date: '2025-11-09T12:00:00', expected: '1 month ago' },
            { desc: '2 months ago', date: '2025-10-09T12:00:00', expected: '2 months ago' },
            { desc: '11 months ago', date: '2025-01-09T12:00:00', expected: '11 months ago' },

            // Years
            { desc: '1 year ago', date: '2024-12-09T12:00:00', expected: '1 year ago' },
            { desc: '2 years ago', date: '2023-12-09T12:00:00', expected: '2 years ago' }
        ];

        testCases.forEach(({ desc, date, expected }) => {
            test(desc, () => {
                const result = helpers.formatDate(date);
                expect(result).toBe(expected);
            });
        });
    });

    describe('formatTextBlockContent', () => {
        test('Escapes HTML characters', () => {
             const input = '<script>alert("xss")</script>';
             const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
             expect(helpers.formatTextBlockContent(input)).toBe(expected);
        });

        test('Preserves plain text', () => {
            expect(helpers.formatTextBlockContent('Hello world')).toBe('Hello world');
        });
        
        test('Converts newlines to double newlines (or single?)', () => {
             // Logic in helpers.js: .replace(/\r\n/g, '\n').replace(/\n+/g, '\n\n')
             expect(helpers.formatTextBlockContent('Line 1\nLine 2')).toBe('Line 1\n\nLine 2');
        });
    });

    describe('formatCommentCount', () => {
        test('returns "discuss" for 0 comments', () => {
            expect(helpers.formatCommentCount(0)).toBe('discuss');
        });
        test('returns "1 comment" for 1 comment', () => {
            expect(helpers.formatCommentCount(1)).toBe('1 comment');
        });
        test('returns "5 comments" for 5 comments', () => {
            expect(helpers.formatCommentCount(5)).toBe('5 comments');
        });
    });

    // Add more helper tests here as needed
});
