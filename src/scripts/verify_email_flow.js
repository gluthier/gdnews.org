const path = require('path');
const result = require('dotenv').config({ path: path.join(__dirname, '../../.env.development') }); 
// Note: We force .env.development for this script as it's likely a dev script
if (result.error) {
    console.warn('Could not load .env.development, trying .env');
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const UserService = require('../services/user-service');
const database = require('../database/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

async function verifyFlow() {
    console.log('Starting verification flow...');
    const username = 'verify_user_' + crypto.randomBytes(4).toString('hex');
    const email = `${username}@example.com`;
    const password = 'password123';
    
    try {
        // 1. Register User
        console.log(`\n1. Registering user: ${username}, ${email}`);
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await UserService.createUser({ username, password_hash: hashedPassword, email });
        const userId = result.insertId;
        console.log(`User created with ID: ${userId}`);

        // Verify user created but not verified
        let user = await UserService.getUserById(userId);
        console.log(`User email_verified (expect 0): ${user.email_verified}`);
        if (user.email_verified) throw new Error('User should not be verified yet');

        // 2. Check for token
        const tokens = await database.query('SELECT * FROM email_confirmations WHERE user_id = ?', [userId]);
        if (tokens.length === 0) throw new Error('No confirmation token found');
        const tokenData = tokens[0];
        console.log(`Token found: ${tokenData.token}`);

        // 3. Confirm Email
        console.log('\n3. Verifying email with token...');
        await UserService.verifyAndComplete(tokenData.token);
        
        user = await UserService.getUserById(userId);
        console.log(`User email_verified (expect 1): ${user.email_verified}`);
        if (!user.email_verified) throw new Error('User should be verified now');

        // 4. Change Email
        const newEmail = `new_${email}`;
        console.log(`\n4. Initiating email change to: ${newEmail}`);
        await UserService.initiateEmailConfirmation(userId, newEmail, 'CHANGE_EMAIL');

        // Verify email still old
        user = await UserService.getUserById(userId);
        console.log(`User email before confirm (expect old): ${user.email}`);
        if (user.email === newEmail) throw new Error('Email should not be changed yet');

        // Get new token
        const newTokens = await database.query('SELECT * FROM email_confirmations WHERE user_id = ?', [userId]);
        const newTokenData = newTokens[0]; // Assuming old one deleted? Wait, initiate doesn't delete old tokens for other types?
        // Actually verifyAndComplete deletes the USED token.
        console.log(`New Token found: ${newTokenData.token}`);

        // 5. Confirm Change
        console.log('\n5. Verifying email change...');
        await UserService.verifyAndComplete(newTokenData.token);

        user = await UserService.getUserById(userId);
        console.log(`User email after confirm (expect new): ${user.email}`);
        if (user.email !== newEmail) throw new Error('Email not updated');

        console.log('\nVerification flow completed successfully!');

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await database.close();
    }
}

verifyFlow();
