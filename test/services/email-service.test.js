const nodemailer = require('nodemailer');
const EmailService = require('../../src/services/email-service');

// Mock nodemailer
jest.mock('nodemailer');

describe('EmailService', () => {
    let originalEnv;
    let consoleLogSpy;
    let consoleWarnSpy;
    let consoleErrorSpy;
    let sendMailMock;

    beforeEach(() => {
        // Save original env
        originalEnv = { ...process.env };
        
        // Mock console methods to avoid cluttering test output and to assert on logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Reset nodemailer mock
        jest.clearAllMocks();
        
        // Setup default sendMail mock
        sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-message-id' });
        nodemailer.createTransport.mockReturnValue({
            sendMail: sendMailMock
        });
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe('createTransporter', () => {
        it('should return a transporter when SMTP_HOST is set', () => {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.SMTP_USER = 'user';
            process.env.SMTP_PASS = 'pass';

            const transporter = EmailService.createTransporter();

            expect(transporter).toBeDefined();
            expect(nodemailer.createTransport).toHaveBeenCalledWith({
                host: 'smtp.example.com',
                port: '587',
                secure: false, // 587 is not 465
                requireTLS: true,
                auth: {
                    user: 'user',
                    pass: 'pass',
                },
            });
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should use secure: true for port 465', () => {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '465';

            EmailService.createTransporter();

            expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
                secure: true
            }));
        });

        it('should return null and warn when SMTP_HOST is not set', () => {
            delete process.env.SMTP_HOST;

            const transporter = EmailService.createTransporter();

            expect(transporter).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST not set'));
            expect(nodemailer.createTransport).not.toHaveBeenCalled();
        });
    });

    describe('sendConfirmationEmail', () => {
        const to = 'test@example.com';
        const token = 'test-token';

        beforeEach(() => {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.APP_PROTOCOL = 'http';
            process.env.APP_DOMAIN = 'test.com';
        });

        it('should send email using transporter when configured', async () => {
            await EmailService.sendConfirmationEmail(to, token, 'REGISTER');

            expect(nodemailer.createTransport).toHaveBeenCalled();
            expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
                to: to,
                subject: 'Confirm your account',
                html: expect.stringContaining('http://test.com/auth/confirm-email?token=test-token')
            }));
            expect(consoleLogSpy).toHaveBeenCalledWith('Message sent: test-message-id');
        });

        it('should correctly format link for CHANGE_EMAIL type', async () => {
            await EmailService.sendConfirmationEmail(to, token, 'CHANGE_EMAIL');

            expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
                subject: 'Confirm your new email address',
                html: expect.stringContaining('http://test.com/auth/confirm-change-email?token=test-token')
            }));
        });

        it('should fall back to console log if transporter is null (no config)', async () => {
            delete process.env.SMTP_HOST; // Triggers fallback logic

            await EmailService.sendConfirmationEmail(to, token, 'REGISTER');

            expect(sendMailMock).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[SIMULATED EMAIL due to missing config or error]'));
            expect(consoleLogSpy).toHaveBeenCalledWith(`To: ${to}`);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('http://test.com/auth/confirm-email?token=test-token'));
        });

        it('should log error and fall back to console log if sendMail fails', async () => {
            const error = new Error('SMTP Error');
            sendMailMock.mockRejectedValue(error);

            await EmailService.sendConfirmationEmail(to, token, 'REGISTER');

            expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending email:', error);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Falling back to console log due to error.');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[SIMULATED EMAIL due to missing config or error]'));
        });
    });
});
