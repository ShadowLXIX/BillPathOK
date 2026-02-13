import nodemailer from 'nodemailer';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper function to format stage names
function formatStage(stage) {
  const stageNames = {
    'introduced': 'Introduced',
    'committee': 'In Committee',
    'committee_approved': 'Committee Approved',
    'floor_calendar': 'Floor Calendar',
    'passed_chamber': 'Passed Chamber',
    'enrolled': 'Enrolled',
    'signed': 'Signed',
    'became_law': 'Became Law',
    'vetoed': 'Vetoed',
    'dead': 'Dead'
  };
  return stageNames[stage] || stage;
}

// Email templates
const emailTemplates = {
  billStatusChange: (bill, oldStage, newStage, subscription) => ({
    subject: `📋 ${bill.identifier} Status Update`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .bill-info { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #3b82f6; }
          .status-change { display: flex; align-items: center; justify-content: center; margin: 20px 0; }
          .status-badge { padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
          .old-status { background: #fef3c7; color: #92400e; }
          .new-status { background: #d1fae5; color: #065f46; }
          .arrow { margin: 0 15px; font-size: 24px; color: #6b7280; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Oklahoma Bill Tracker</h1>
            <p style="margin: 5px 0 0 0;">Bill Status Update</p>
          </div>
          
          <div class="content">
            <h2>📋 Bill Update</h2>
            
            <div class="bill-info">
              <h3 style="margin-top: 0; color: #3b82f6;">${bill.identifier}</h3>
              <p><strong>${bill.title}</strong></p>
              <p style="margin: 5px 0;">
                <strong>Latest Action:</strong> ${bill.latest_action_description}
              </p>
              <p style="margin: 5px 0; color: #6b7280;">
                ${new Date(bill.latest_action_date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            
            <div class="status-change">
              <span class="status-badge old-status">${formatStage(oldStage)}</span>
              <span class="arrow">→</span>
              <span class="status-badge new-status">${formatStage(newStage)}</span>
            </div>
            
            <p style="text-align: center;">
              <a href="${process.env.APP_URL}/bill/${bill.identifier}" class="button">
                View Full Bill Details
              </a>
            </p>
          </div>
          
          <div class="footer">
            <p>Oklahoma Legislative Bill Tracker</p>
            <p>
              <a href="${process.env.APP_URL}/unsubscribe/${subscription.id}?token=${subscription.verification_token}" style="color: #6b7280;">
                Unfollow this bill
              </a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  verificationEmail: (email, token, billIdentifier) => ({
    subject: '✅ Confirm Following ' + billIdentifier,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Confirm Your Subscription</h2>
          <p>Click the link below to confirm you want to follow <strong>${billIdentifier}</strong>:</p>
          <p style="text-align: center;">
            <a href="${process.env.APP_URL}/api/subscribe/verify?email=${encodeURIComponent(email)}&token=${token}" 
               style="background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Confirm Subscription
            </a>
          </p>
        </div>
      </body>
      </html>
    `
  })
};

// Send email function
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Oklahoma Bill Tracker <noreply@example.com>',
      to,
      subject,
      html
    });
    console.log(`✅ Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending email:`, error.message);
    return { success: false, error: error.message };
  }
}

// Export functions
export async function sendBillStatusChangeEmail(bill, oldStage, newStage, subscription) {
  const template = emailTemplates.billStatusChange(bill, oldStage, newStage, subscription);
  return await sendEmail(subscription.email, template.subject, template.html);
}

export async function sendVerificationEmail(email, token, billIdentifier) {
  const template = emailTemplates.verificationEmail(email, token, billIdentifier);
  return await sendEmail(email, template.subject, template.html);
}

export default {
  sendEmail,
  sendBillStatusChangeEmail,
  sendVerificationEmail
};
