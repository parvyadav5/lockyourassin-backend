const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend securely
// If the key is missing from Render/local env, it fails gracefully without crashing the backend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function verifyMailer() {
  if (resend) {
    console.log('✅ Resend mailer ready');
    return true;
  } else {
    console.error('⚠️  RESEND_API_KEY is missing from environment variables. Emails will not send.');
    return false;
  }
}

// Temporary empty placeholder for the next step.
// We do not crash the app if this is called, we just log and return.
async function sendReminderEmail(toEmail, task, daysLeft, type = 'daily', motivationalMsg = '') {
  if (!resend) {
    console.error(`❌ Cannot send email to ${toEmail}: Resend is not initialized.`);
    return null;
  }

  console.log(`[Resend placeholder] Preparing email connection for ${toEmail}...`);
  return { success: true };
}

module.exports = { verifyMailer, sendReminderEmail };