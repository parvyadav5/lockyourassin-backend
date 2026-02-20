const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function verifyMailer() {
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY missing');
    return false;
  }
  console.log('✅ Resend mailer ready');
  return true;
}

async function sendReminderEmail(toEmail, task, daysLeft, type = 'daily', motivationalMsg = '') {
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ Cannot send email: Resend not initialized');
    return;
  }

  const deadlineDate = task.deadline?.toDate
    ? task.deadline.toDate()
    : new Date(task.deadline);

  const deadlineStr = deadlineDate.toLocaleString();

  const subject =
    type === 'urgent'
      ? `⚠️ Urgent: ${task.title}`
      : `⏰ Reminder: ${task.title}`;

  const html = `
    <h2>🔒 LockYourAssIn Reminder</h2>
    <p><b>Task:</b> ${task.title}</p>
    <p><b>Deadline:</b> ${deadlineStr}</p>
    <p><b>Days Left:</b> ${daysLeft}</p>
    <p>${motivationalMsg || 'Stay focused and finish it 💪'}</p>
  `;

  try {
    await resend.emails.send({
      from: 'LockYourAssIn <onboarding@resend.dev>',
      to: toEmail,
      subject,
      html,
    });

    console.log(`📧 Email sent successfully to ${toEmail}`);
  } catch (error) {
    console.error(`❌ Resend email failed:`, error.message);
  }
}

module.exports = { verifyMailer, sendReminderEmail };