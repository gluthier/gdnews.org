jest.mock('child_process', () => ({
    execFileSync: jest.fn()
}));

const { execFileSync } = require('child_process');
const { publishGeneratedSite, formatTimestamp } = require('../../src/pipeline/publish');

describe('publish pipeline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('commits and pushes generated files when public changes exist', () => {
        execFileSync.mockImplementation((command, args) => {
            if (command !== 'git') {
                throw new Error(`Unexpected command: ${command}`);
            }

            if (args.join(' ') === 'branch --show-current') {
                return 'main\n';
            }

            if (args.join(' ') === 'diff --cached --name-only') {
                return '';
            }

            if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--quiet') {
                const error = new Error('changes present');
                error.status = 1;
                throw error;
            }

            return '';
        });

        const result = publishGeneratedSite({
            cwd: '/repo',
            timestamp: '20260309-053507'
        });

        expect(result).toMatchObject({
            changed: true,
            committed: true,
            pushed: true,
            branch: 'main',
            remote: 'origin',
            commitMessage: 'chore: refresh generated site (20260309-053507)'
        });
        expect(execFileSync).toHaveBeenCalledWith('git', ['add', '-A', '--', 'public'], expect.objectContaining({
            cwd: '/repo',
            stdio: 'inherit'
        }));
        expect(execFileSync).toHaveBeenCalledWith('git', ['commit', '-m', 'chore: refresh generated site (20260309-053507)'], expect.objectContaining({
            cwd: '/repo',
            stdio: 'inherit'
        }));
        expect(execFileSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.objectContaining({
            cwd: '/repo',
            stdio: 'inherit'
        }));
    });

    test('skips when there are no generated changes', () => {
        execFileSync.mockImplementation((command, args) => {
            if (command !== 'git') {
                throw new Error(`Unexpected command: ${command}`);
            }

            if (args.join(' ') === 'branch --show-current') {
                return 'main\n';
            }

            if (args.join(' ') === 'diff --cached --name-only') {
                return '';
            }

            return '';
        });

        const result = publishGeneratedSite({
            cwd: '/repo',
            timestamp: '20260309-053507'
        });

        expect(result).toMatchObject({
            changed: false,
            committed: false,
            pushed: false,
            skipped: true,
            reason: 'no_changes'
        });
        expect(execFileSync).not.toHaveBeenCalledWith('git', expect.arrayContaining(['commit']), expect.anything());
        expect(execFileSync).not.toHaveBeenCalledWith('git', expect.arrayContaining(['push']), expect.anything());
    });

    test('skips when unrelated staged changes already exist', () => {
        execFileSync.mockImplementation((command, args) => {
            if (command !== 'git') {
                throw new Error(`Unexpected command: ${command}`);
            }

            if (args.join(' ') === 'branch --show-current') {
                return 'main\n';
            }

            if (args.join(' ') === 'diff --cached --name-only') {
                return 'README.md\n';
            }

            return '';
        });

        const result = publishGeneratedSite({
            cwd: '/repo',
            timestamp: '20260309-053507'
        });

        expect(result).toMatchObject({
            changed: false,
            committed: false,
            pushed: false,
            skipped: true,
            reason: 'staged_changes_present',
            stagedFiles: ['README.md']
        });
        expect(execFileSync).not.toHaveBeenCalledWith('git', ['add', '-A', '--', 'public'], expect.anything());
    });

    test('formats timestamps in launchd-friendly format', () => {
        expect(formatTimestamp(new Date('2026-03-09T05:35:07'))).toBe('20260309-053507');
    });
});
