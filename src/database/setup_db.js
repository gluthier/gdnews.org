const resetMinimalDatabase = require('./reset_minimal_db');

resetMinimalDatabase().catch((error) => {
    console.error('Setup failed:', error.message);
    process.exitCode = 1;
});
