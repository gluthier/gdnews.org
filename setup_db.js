require('dotenv').config();
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');

async function setup() {
    let conn;
    try {
        // Connect without database selected to create it
        conn = await mariadb.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        await conn.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log('Database created or already exists.');
        await conn.end();

        // Connect to the database to run schema
        const pool = mariadb.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        conn = await pool.getConnection();
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

        // Split by semicolon to run multiple statements
        const statements = schema.split(';').filter(s => s.trim());
        for (const statement of statements) {
            await conn.query(statement);
        }
        console.log('Schema applied successfully.');

    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

setup();
