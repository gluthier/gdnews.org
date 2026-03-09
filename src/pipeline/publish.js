const { execFileSync } = require('child_process');

const DEFAULT_PATHS = ['public'];

function runGit(args, { cwd, stdio = 'pipe' }) {
    return execFileSync('git', args, {
        cwd,
        stdio,
        encoding: 'utf8'
    });
}

function formatTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('');
}

function listStagedFiles(cwd) {
    const output = runGit(['diff', '--cached', '--name-only'], { cwd });
    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function hasStagedChangesForPaths(cwd, paths) {
    try {
        runGit(['diff', '--cached', '--quiet', '--', ...paths], {
            cwd,
            stdio: 'ignore'
        });
        return false;
    } catch (error) {
        if (error.status === 1) {
            return true;
        }
        throw error;
    }
}

function getCurrentBranch(cwd) {
    return runGit(['branch', '--show-current'], { cwd }).trim();
}

function publishGeneratedSite(options = {}) {
    const cwd = options.cwd || process.cwd();
    const paths = Array.isArray(options.paths) && options.paths.length > 0
        ? options.paths
        : DEFAULT_PATHS;
    const remote = options.remote || 'origin';
    const branch = options.branch || getCurrentBranch(cwd);
    const timestamp = options.timestamp || formatTimestamp();
    const commitMessage = options.commitMessage || `chore: refresh generated site (${timestamp})`;

    const preexistingStagedFiles = listStagedFiles(cwd);
    if (preexistingStagedFiles.length > 0) {
        console.log(`Publish skipped: staged changes already exist (${preexistingStagedFiles.join(', ')}).`);
        return {
            changed: false,
            committed: false,
            pushed: false,
            skipped: true,
            reason: 'staged_changes_present',
            stagedFiles: preexistingStagedFiles
        };
    }

    console.log(`Staging generated files: ${paths.join(', ')}`);
    runGit(['add', '-A', '--', ...paths], {
        cwd,
        stdio: 'inherit'
    });

    if (!hasStagedChangesForPaths(cwd, paths)) {
        console.log('No generated changes to commit.');
        return {
            changed: false,
            committed: false,
            pushed: false,
            skipped: true,
            reason: 'no_changes'
        };
    }

    console.log(`Committing generated files: ${commitMessage}`);
    runGit(['commit', '-m', commitMessage], {
        cwd,
        stdio: 'inherit'
    });

    console.log(`Pushing generated files to ${remote}/${branch}`);
    runGit(['push', remote, branch], {
        cwd,
        stdio: 'inherit'
    });

    return {
        changed: true,
        committed: true,
        pushed: true,
        branch,
        remote,
        commitMessage
    };
}

if (require.main === module) {
    try {
        publishGeneratedSite();
    } catch (error) {
        console.error('Publish step failed:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    publishGeneratedSite,
    formatTimestamp
};
