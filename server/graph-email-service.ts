import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

// Azure AD configuration from your app registration
const clientConfig = process.env.AZURE_CLIENT_SECRET ? {
  auth: {
    clientId: '9bce1119-d4af-4392-89e9-895e205a934f',
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: 'https://login.microsoftonline.com/9179a0c5-4c5d-491e-a603-822433d32de1'
  }
} : null;

const cca = clientConfig ? new ConfidentialClientApplication(clientConfig) : null;

interface GraphEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmailViaGraph(options: GraphEmailOptions): Promise<boolean> {
  try {
    if (!cca) {
      console.warn('Azure credentials not configured. Email sending via Graph API is unavailable.');
      return false;
    }

    console.log('=== MICROSOFT GRAPH API EMAIL DELIVERY ===');
    console.log('Sending email via Microsoft Graph API to:', options.to);
    console.log('Subject:', options.subject);
    console.log('From:', 'r.steenvoorden@dc-people.nl');
    
    // Verify Azure credentials are available
    if (!process.env.AZURE_CLIENT_SECRET) {
      console.error('AZURE_CLIENT_SECRET not found in environment variables');
      return false;
    }
    
    console.log('Azure Client ID:', '9bce1119-d4af-4392-89e9-895e205a934f');
    console.log('Azure Tenant ID:', '9179a0c5-4c5d-491e-a603-822433d32de1');
    console.log('Client Secret Available:', !!process.env.AZURE_CLIENT_SECRET);
    
    // Get access token using client credentials flow
    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    console.log('Acquiring access token for Microsoft Graph API...');
    const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
    
    if (!response) {
      console.error('Failed to acquire access token from Azure AD');
      return false;
    }

    console.log('Successfully acquired access token for Graph API');
    console.log('Token type:', response.tokenType);
    console.log('Token expires at:', new Date(response.expiresOn || 0));

    // Prepare email message
    const message = {
      message: {
        subject: options.subject,
        body: {
          contentType: 'HTML',
          content: options.html
        },
        toRecipients: [
          {
            emailAddress: {
              address: options.to
            }
          }
        ],

      },
      saveToSentItems: true
    };

    // Send email using Microsoft Graph API with application permissions
    // For application permissions, we need to send as a specific user
    const graphResponse = await axios.post(
      'https://graph.microsoft.com/v1.0/users/r.steenvoorden@dc-people.nl/sendMail',
      message,
      {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Graph API response status:', graphResponse.status);
    console.log('Graph API response data:', graphResponse.data);

    console.log('Email sent successfully via Graph API:', graphResponse.status);
    return true;

  } catch (error: any) {
    console.error('=== MICROSOFT GRAPH API ERROR ===');
    console.error('Microsoft Graph email error:', error.message || error);
    if (error.response) {
      console.error('Graph API response status:', error.response.status);
      console.error('Graph API response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Graph API response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
    console.error('Full error object:', JSON.stringify(error, null, 2));
    return false;
  }
}

// Email Templates (reusing from original email service)
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
                <p>Best regards,<br>DC People Team</p>
            </div>
            <div class="footer">
                <p>This email was sent from DC People recruitment platform.</p>
                <p>If you have any questions, please contact our support team.</p>
            </div>
        </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}

export function createUserInvitationEmail(fullName: string, setPasswordUrl: string): { subject: string; html: string } {
  const subject = 'Welcome to DC People - Set Your Password';
  
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
            .action-box { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
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
                <p>Your account has been created successfully. You can now access the DC People recruitment platform.</p>
                
                <div class="action-box">
                    <h3>Set Your Password</h3>
                    <p>To complete your account setup, please click the button below to create your secure password:</p>
                    <p><a href="${setPasswordUrl}" class="button">Set My Password</a></p>
                    <p><em>This link will expire in 3 days for security purposes.</em></p>
                </div>
                
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0066cc;">${setPasswordUrl}</p>
                
                <p>Best regards,<br>DC People Team</p>
            </div>
            <div class="footer">
                <p>This email was sent from DC People recruitment platform.</p>
                <p>If you have any questions, please contact our support team.</p>
            </div>
        </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}