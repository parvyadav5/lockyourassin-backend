// =============================================
//  Mailer — Send Reminder Emails via Gmail SMTP
//  ─────────────────────────────────────────────
//  Uses nodemailer with Gmail App Password.
//  Works inside Firebase Cloud Functions.
// =============================================

const nodemailer = require('nodemailer');
const { defineString } = require('firebase-functions/params');

// Environment variables set via .env or firebase functions:config
const emailUser = defineString('EMAIL_USER');
const emailPass = defineString('EMAIL_PASS');

/**
 * Create a fresh transporter each call (Cloud Functions are stateless)
 */
function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: emailUser.value(),
            pass: emailPass.value(),
        },
    });
}

/**
 * Send a task reminder email
 *
 * @param {string} toEmail — recipient email
 * @param {object} task — task object { title, priority, deadline }
 * @param {number} daysLeft — days remaining
 * @param {string} type — 'daily' or 'urgent'
 * @param {string} motivationalMsg — gender-based motivational message
 */
async function sendReminderEmail(toEmail, task, daysLeft, type = 'daily', motivationalMsg = '') {
    const deadlineDate = task.deadline.toDate
        ? task.deadline.toDate()
        : new Date(task.deadline);

    const deadlineStr = deadlineDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    let urgency = '';
    let subject = '';
    let accentColor = '#e8772e';
    let bgColor = '#fdf6ec';

    if (type === 'urgent') {
        if (daysLeft <= 1) {
            urgency = '🚨 DUE TOMORROW — ACT NOW!';
        } else {
            urgency = `🚨 Only ${daysLeft} Days Left!`;
        }
        subject = `⚠️ Urgent Task Reminder: ${task.title} — ${urgency}`;
        accentColor = '#e74c3c';
        bgColor = '#fef2f2';
    } else {
        if (daysLeft === 7) {
            urgency = '⏰ 7-Day Heads Up';
        } else if (daysLeft <= 1) {
            urgency = '🚨 Due Tomorrow!';
        } else {
            urgency = `⚡ ${daysLeft} Days Left`;
        }
        subject = `⏰ Task Reminder: ${task.title} — ${urgency}`;
    }

    const continuousNote = type === 'urgent'
        ? '<p style="color: #e74c3c; font-size: 13px; margin: 16px 0 0; text-align: center; font-weight: 600;">⚠️ You will continue receiving reminders every 2 hours until this task is completed or the deadline passes.</p>'
        : '';

    const mailOptions = {
        from: `"LockYourAssIn 🔒" <${emailUser.value()}>`,
        to: toEmail,
        subject: subject,
        html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: ${bgColor}; border-radius: 16px;">
        <h1 style="color: ${accentColor}; font-size: 22px; margin: 0 0 8px;">🔒 LockYourAssIn</h1>
        <p style="color: #666; font-size: 13px; margin: 0 0 24px;">${type === 'urgent' ? '⚠️ Urgent Task Reminder' : '⏰ Task Reminder'}</p>

        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); ${type === 'urgent' ? 'border-left: 4px solid #e74c3c;' : ''}">
          <p style="color: #333; font-size: 15px; margin: 0 0 16px;">Hello,</p>
          <p style="color: #333; font-size: 15px; margin: 0 0 20px;">${type === 'urgent' ? 'This is an <strong>urgent reminder</strong> that your task deadline is approaching.' : 'You have an upcoming task:'}</p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px; width: 80px;">Title</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${task.title}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Priority</td>
              <td style="padding: 8px 0; color: ${task.priority === 'high' ? '#e74c3c' : task.priority === 'medium' ? '#f39c12' : '#27ae60'}; font-size: 14px; font-weight: 600; text-transform: uppercase;">${task.priority || 'medium'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Deadline</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 500;">${deadlineStr}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Status</td>
              <td style="padding: 8px 0; color: ${accentColor}; font-size: 14px; font-weight: 600;">${urgency}</td>
            </tr>
          </table>
        </div>

        <p style="color: ${accentColor}; font-size: 15px; margin: 24px 0 0; text-align: center; font-weight: 600;">
          ${motivationalMsg || 'Stay focused and complete it on time. 💪'}
        </p>
        ${continuousNote}
        <p style="color: #aaa; font-size: 11px; margin: 16px 0 0; text-align: center;">
          — LockYourAssIn Reminder System
        </p>
      </div>
    `,
    };

    try {
        const transporter = createTransporter();
        const info = await transporter.sendMail(mailOptions);
        console.log(`  ✉️  Email sent to ${toEmail} for "${task.title}" (${urgency}) [${type}]`);
        return info;
    } catch (error) {
        console.error(`  ❌ Failed to send email to ${toEmail}:`, error.message);
        throw error;
    }
}

module.exports = { sendReminderEmail };
