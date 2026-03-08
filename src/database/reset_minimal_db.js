const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mariadb = require('mariadb');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile), quiet: true });

const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const TABLES_TO_DROP = [
    'email_confirmations',
    'favourites',
    'comments',
    'posts',
    'users',
    'system_settings',
    'sessions'
];

function hasConfirmationArg() {
    return process.argv.includes('--yes') || process.env.GDNEWS_CONFIRM_DB_RESET === 'true';
}

async function promptConfirmation() {
    if (!process.stdin.isTTY) {
        throw new Error('Refusing to reset without explicit confirmation. Re-run with --yes or GDNEWS_CONFIRM_DB_RESET=true.');
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise((resolve) => {
        rl.question('This will permanently delete existing data. Type RESET to continue: ', resolve);
    });

    rl.close();

    if (answer.trim() !== 'RESET') {
        throw new Error('Confirmation failed. Database reset aborted.');
    }
}

function validateEnv() {
    for (const key of REQUIRED_VARS) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
}

async function applySchema(connection) {
    const schemaPath = path.join(__dirname, './schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(';').map((entry) => entry.trim()).filter(Boolean);

    for (const statement of statements) {
        await connection.query(statement);
    }
}

async function resetMinimalDatabase() {
    validateEnv();

    if (!hasConfirmationArg()) {
        await promptConfirmation();
    }

    let adminConnection;
    let dbConnection;

    try {
        adminConnection = await mariadb.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        await adminConnection.end();
        adminConnection = null;

        dbConnection = await mariadb.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        await dbConnection.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const table of TABLES_TO_DROP) {
            await dbConnection.query(`DROP TABLE IF EXISTS \`${table}\``);
        }
        await dbConnection.query('SET FOREIGN_KEY_CHECKS = 1');

        await applySchema(dbConnection);
        console.log('Minimal database schema applied successfully.');
    } finally {
        if (adminConnection) {
            await adminConnection.end();
        }
        if (dbConnection) {
            await dbConnection.end();
        }
    }
}

if (require.main === module) {
    resetMinimalDatabase().catch((error) => {
        console.error('Database reset failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = resetMinimalDatabase;
