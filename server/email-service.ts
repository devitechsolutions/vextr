import nodemailer from 'nodemailer';

// O365 SMTP Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  },
  requireTLS: true,
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    console.log('Attempting to send email to:', options.to);
    
    const mailOptions = {
      from: `"DC People" <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    console.log('Sending email with subject:', mailOptions.subject);

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

// Email Templates
export function createPasswordResetEmail(fullName: string, resetLink: string): { subject: string; html: string } {
  const subject = 'Reset Your DC People Account Password';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - DC People</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #0066cc; }
            .logo { font-size: 24px; font-weight: bold; color: #0066cc; }
            .content { padding: 30px 0; }
            .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">DC People</div>
            </div>
            <div class="content">
                <h2>Password Reset Request</h2>
                <p>Hello ${fullName},</p>
                <p>We received a request to reset your password for your DC People account. If you didn't make this request, please ignore this email.</p>
                <p>To reset your password, click the button below:</p>
                <p><a href="${resetLink}" class="button">Reset Password</a></p>
                <p>This link will expire in 24 hours for security reasons.</p>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0066cc;">${resetLink}</p>
                <p>Best regards,<br>The DC People Team</p>
            </div>
            <div class="footer">
                <p>This is an automated message from DC People recruitment platform.</p>
                <p>If you have any questions, please contact your system administrator.</p>
            </div>
        </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}

export function createInvitationEmail(fullName: string, inviteLink: string): { subject: string; html: string } {
  const subject = 'Welcome to DC People - Set Up Your Account';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to DC People</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #0066cc; }
            .logo { font-size: 24px; font-weight: bold; color: #0066cc; }
            .content { padding: 30px 0; }
            .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">DC People</div>
            </div>
            <div class="content">
                <h2>Welcome to DC People!</h2>
                <p>Hello ${fullName},</p>
                <p>You've been invited to join the DC People recruitment platform. Our advanced system helps streamline talent acquisition with intelligent candidate management and CRM integration.</p>
                <p>To get started, please set up your account by clicking the button below:</p>
                <p><a href="${inviteLink}" class="button">Set Up Account</a></p>
                <p>This invitation link will expire in 7 days for security reasons.</p>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0066cc;">${inviteLink}</p>
                <p>Once you've set up your account, you'll have access to:</p>
                <ul>
                    <li>Advanced candidate management system</li>
                    <li>Live Vtiger CRM integration</li>
                    <li>Intelligent candidate matching</li>
                    <li>CV parsing and formatting tools</li>
                    <li>Job description generator</li>
                </ul>
                <p>Welcome to the team!</p>
                <p>Best regards,<br>The DC People Team</p>
            </div>
            <div class="footer">
                <p>This is an automated message from DC People recruitment platform.</p>
                <p>If you have any questions, please contact your system administrator.</p>
            </div>
        </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}