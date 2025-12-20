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
                    from: process.env.SMTP_FROM || '"GDNews" <noreply@example.com>',
                    to: to,
                    subject: subject,
                    text: text,
                    html: html
                });
                console.log(`Message sent: ${info.messageId}`);
                return;
            } catch (error) {
                console.error('Error sending email:', error);
                console.warn('Falling back to console log due to error.');
                // Fall through to logging
            }
        }

        console.log('---------------------------------------------------');
        console.log(`[SIMULATED EMAIL due to missing config or error]`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Link: ${link}`);
        console.log('---------------------------------------------------');
    }
};

module.exports = EmailService;
