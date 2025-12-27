const nodemailer = require('nodemailer');

/**
 * Service to handle email operations
 */
const EmailService = {
    /**
     * Create transporter
     * @returns {Object|null} Nodemailer transporter or null if not configured
     */
    createTransporter() {
        if (!process.env.SMTP_HOST) {
            console.warn('SMTP_HOST not set. Falling back to simulated email logging.');
            return null;
        }
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
            requireTLS: process.env.SMTP_PORT == 587, // Force STARTTLS for port 587
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    },

    /**
     * Send confirmation email
     * @param {string} to - Recipient email
     * @param {string} token - Confirmation token
     * @param {string} type - Type of confirmation ('REGISTER' or 'CHANGE_EMAIL')
     */
    async sendConfirmationEmail(to, token, type = 'REGISTER') {
        const protocol = process.env.APP_PROTOCOL || 'http';
        const domain = process.env.APP_DOMAIN || 'localhost';
        const port = process.env.NODE_ENV === 'development' && process.env.PORT ? `:${process.env.PORT}` : '';
        const baseUrl = `${protocol}://${domain}${port}`;
        
        const action = type === 'REGISTER' ? 'confirm-email' : 'confirm-change-email';
        const link = `${baseUrl}/auth/${action}?token=${token}`;
        const subject = type === 'REGISTER' ? 'Confirm your account' : 'Confirm your new email address';
        const text = `Please click the following link to confirm:\n\n${link}`;
        const html = `<p>Please click the following link to confirm:</p><p><a href="${link}">${link}</a></p>`;

        const transporter = this.createTransporter();

        if (transporter) {
            try {
                const info = await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"gdnews" <noreply@gdnews.org>',
                    to: to,
                    subject: subject,
                    text: text,
                    html: html
                });
                console.log(`Message sent: ${info.messageId}`);
                return;
            } catch (error) {
                this._handleSmtpError(error, { to, subject, type: 'CONFIRMATION' });
                // Fall through to logging
            }
        }

        // Simulation/Fallback log
        console.log('[SIMULATED EMAIL due to missing config or error]');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Link: ${link}`);
    },

    /**
     * Send password reset email
     * @param {string} to - Recipient email
     * @param {string} token - Reset token
     */
    async sendPasswordResetEmail(to, token) {
        const protocol = process.env.APP_PROTOCOL || 'http';
        const domain = process.env.APP_DOMAIN || 'localhost';
        const port = process.env.NODE_ENV === 'development' && process.env.PORT ? `:${process.env.PORT}` : '';
        const baseUrl = `${protocol}://${domain}${port}`;
        
        const link = `${baseUrl}/auth/reset-password?token=${token}`;
        const subject = 'Reset your password';
        const text = `Please click the following link to reset your password:\n\n${link}\n\nThis link will expire in 1 hour.`;
        const html = `<p>Please click the following link to reset your password:</p><p><a href="${link}">${link}</a></p><p>This link will expire in 1 hour.</p>`;

        const transporter = this.createTransporter();

        if (transporter) {
            try {
                const info = await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"gdnews" <noreply@gdnews.org>',
                    to: to,
                    subject: subject,
                    text: text,
                    html: html
                });
                console.log(`Password reset email sent: ${info.messageId}`);
                return;
            } catch (error) {
                this._handleSmtpError(error, { to, subject, type: 'PASSWORD_RESET' });
                // Fall through to logging
            }
        }

        // Simulation/Fallback log
        console.log('[SIMULATED EMAIL due to missing config or error]');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Link: ${link}`);
    },

    /**
     * Handle SMTP errors with specific categorization and logging
     * @param {Error} error - The error from Nodemailer
     * @param {Object} context - Metadata about the failed email
     * @private
     */
    _handleSmtpError(error, context) {
        let isRblBlacklisted = false;
        let rblLink = null;

        if (error.response) {
            // Check for RBL blacklisting
            // Example: "554 5.7.1 mipocey919@gmail.com is rbl blacklisted - http://chk.me/rbl"
            if (error.response.toLowerCase().includes('rbl blacklisted')) {
                isRblBlacklisted = true;
                const match = error.response.match(/https?:\/\/[^\s]+/);
                if (match) {
                    rblLink = match[0];
                }
            }
        }

        if (isRblBlacklisted) {
            console.error(`Email Error: RBL Blacklisted while sending ${context.type} to ${context.to}.`);
            if (rblLink) {
                console.error(`Check RBL status here: ${rblLink}`);
            }
            console.error(`SMTP Response: ${error.response}`);
        } else {
            console.error(`Error sending ${context.type} email to ${context.to}:`, error.message || error);
            if (error.response) {
                console.error(`SMTP Response: ${error.response}`);
            }
        }

        console.warn('Falling back to console log/simulation due to email sending failure.');
    }
};

module.exports = EmailService;
