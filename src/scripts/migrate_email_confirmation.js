const database = require('../database/database');

async function migrate() {
    console.log('Starting migration for email confirmation...');

    try {
        // Add email_verified column to users table
        console.log('Adding email_verified column to users table...');
        await database.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE
        `);

        // Create email_confirmations table
        console.log('Creating email_confirmations table...');
        await database.query(`
            CREATE TABLE IF NOT EXISTS email_confirmations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                type ENUM('REGISTER', 'CHANGE_EMAIL') NOT NULL DEFAULT 'REGISTER',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await database.close();
    }
}

migrate();
