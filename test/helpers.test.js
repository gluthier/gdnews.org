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

    // Date Formatting
    describe('formatDateFull', () => {
        test('formats date string correctly', () => {
            const date = '2025-12-25T14:30:00';
            // Output depends on locale, consistent with "en-GB" in implementation
            // 25/12/2025, 14:30:00
            const result = helpers.formatDateFull(date);
            expect(result).toMatch(/25\/12\/2025/);
            expect(result).toMatch(/14:30/);
        });
    });

    describe('formatDatePromotedPost', () => {
        test('formats date for promoted post correctly', () => {
            const date = '2025-12-25T14:30:00';
            // Expected: 25 Dec 2025
            const result = helpers.formatDatePromotedPost(date);
            expect(result).toBe('25 Dec 2025');
        });
    });

    describe('getHostname', () => {
        test('extracts hostname from valid URL', () => {
            expect(helpers.getHostname('https://example.com/page')).toBe('example.com');
        });
        test('removes www.', () => {
            expect(helpers.getHostname('https://www.example.com')).toBe('example.com');
        });
        test('returns empty string for invalid URL', () => {
            expect(helpers.getHostname('not-a-url')).toBe('');
        });
        test('handles simple hostname', () => {
             // new URL('http://localhost') -> hostname 'localhost'
             expect(helpers.getHostname('http://localhost:3000')).toBe('localhost');
        });
    });

    // Comparisons & Logic
    describe('Comparison Helpers', () => {
        test('eq returns true if values match', () => {
            expect(helpers.eq(1, 1)).toBe(true);
            expect(helpers.eq('a', 'a')).toBe(true);
        });
        test('eq returns false if values do not match', () => {
            expect(helpers.eq(1, 2)).toBe(false);
            expect(helpers.eq('1', 1)).toBe(false); // Strict equality check in impl
        });

        test('gt returns true if v1 > v2', () => {
            expect(helpers.gt(2, 1)).toBe(true);
        });
        test('gt returns false if v1 <= v2', () => {
            expect(helpers.gt(1, 1)).toBe(false);
            expect(helpers.gt(0, 1)).toBe(false);
        });

        test('lt returns true if v1 < v2', () => {
            expect(helpers.lt(1, 2)).toBe(true);
        });
        test('lt returns false if v1 >= v2', () => {
            expect(helpers.lt(1, 1)).toBe(false);
            expect(helpers.lt(2, 1)).toBe(false);
        });

        test('or returns v1 if truthy', () => {
            expect(helpers.or('a', 'b')).toBe('a');
        });
        test('or returns v2 if v1 falsy', () => {
            expect(helpers.or(null, 'b')).toBe('b');
            expect(helpers.or(false, true)).toBe(true);
        });
    });

    describe('Math Helpers', () => {
        test('add sums two numbers', () => {
            expect(helpers.add(1, 2)).toBe(3);
        });
        
        test('hoursAgo returns correct hours difference', () => {
             // Mock now to 2025-12-09T14:00:00
             jest.useFakeTimers();
             jest.setSystemTime(new Date('2025-12-09T14:00:00'));
             
             // 2 hours ago
             const date = '2025-12-09T12:00:00';
             expect(helpers.hoursAgo(date)).toBe(2);

             jest.useRealTimers();
        });
    });

    // Array / Collection Helpers
    describe('Array Helpers', () => {
        test('slice returns subarray', () => {
            const arr = [1, 2, 3, 4, 5];
            expect(helpers.slice(arr, 0, 2)).toEqual([1, 2]);
            expect(helpers.slice(arr, 2, 4)).toEqual([3, 4]);
        });
        test('slice returns empty array if input invalid', () => {
            expect(helpers.slice(null, 0, 1)).toEqual([]);
            expect(helpers.slice('not-array', 0, 1)).toEqual([]);
        });

        test('length returns array length', () => {
            expect(helpers.length([1, 2, 3])).toBe(3);
        });
        test('length returns 0 if null/undefined', () => {
            expect(helpers.length(null)).toBe(0);
            expect(helpers.length(undefined)).toBe(0);
        });
        
        test('reduceDescendantCount counts all descendants', () => {
            // Structure: 
            // - Child 1 (descendant_count: 2) -> contributes 1 + 2 = 3
            // - Child 2 (descendant_count: 0) -> contributes 1 + 0 = 1
            // Total = 4
            const children = [
                { descendant_count: 2 },
                { descendant_count: 0 }
            ];
            expect(helpers.reduceDescendantCount(children)).toBe(4);
        });

        test('reduceDescendantCount returns 0 if children is null', () => {
            expect(helpers.reduceDescendantCount(null)).toBe(0);
        });
    });
});
