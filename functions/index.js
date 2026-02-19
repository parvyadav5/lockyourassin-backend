// =============================================
//  Firebase Cloud Functions — FREE PLAN (SPARK)
//  ─────────────────────────────────────────────
//  Unified Reminder System — HTTPS Triggered
//
//  How it works on Free Plan:
//  1. Triggered by EXTERNAL free cron service (e.g., cron-job.org)
//  2. Runs every 2 hours
//  3. Protected by ?key=SECRET query parameter
//  4. Checks both "Daily" (9AM) and "Urgent" tasks
//
//  Deploy: firebase deploy --only functions
//  URL: https://us-central1-YOUR_PROJECT.cloudfunctions.net/checkReminders?key=lockyourassin_secret_123
// =============================================

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { sendReminderEmail } = require('./mailer');
const { getMotivationalMessage } = require('./messageGenerator');

initializeApp();
const db = getFirestore();

// 🔒 SECURITY KEY — Must match ?key= parameter in cron job
const CRON_SECRET_KEY = 'lockyourassin_secret_123';

// =============================================
//  HELPER FUNCTIONS
// =============================================

function getDaysLeft(deadline) {
    const now = new Date();
    const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deadlineStart = new Date(
        deadlineDate.getFullYear(),
        deadlineDate.getMonth(),
        deadlineDate.getDate()
    );
    return Math.ceil((deadlineStart - todayStart) / (1000 * 60 * 60 * 24));
}

function getHoursLeft(deadline) {
    const now = new Date();
    const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);
    return (deadlineDate - now) / (1000 * 60 * 60);
}

function wasWithinHours(timestamp, hours) {
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return (new Date() - date) / (1000 * 60 * 60) < hours;
}

function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isQuietHours() {
    // 11 PM to 7 AM IST
    // Cloud Functions run in UTC usually, but we check LOCAL time relative to user expectation
    // Assuming IST for simplicity as requested (UTC+5:30)
    const now = new Date();
    // Convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const hour = istTime.getUTCHours();
    return hour >= 23 || hour < 7;
}

function isMorningTime() {
    // Check if it's 9:00 AM - 10:59 AM IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const hour = istTime.getUTCHours();
    return hour >= 9 && hour < 11;
}

async function getUserEmail(userId) {
    try {
        const userRecord = await getAuth().getUser(userId);
        return userRecord.email;
    } catch (err) {
        return null;
    }
}

async function getUserGender(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) return userDoc.data().gender || 'male';
        return 'male';
    } catch (err) {
        return 'male';
    }
}

async function getUserTokens(userId) {
    try {
        const tokensSnapshot = await db
            .collection('users')
            .doc(userId)
            .collection('tokens')
            .get();
        if (tokensSnapshot.empty) return [];
        return tokensSnapshot.docs.map((d) => d.data().token).filter(Boolean);
    } catch (err) {
        return [];
    }
}

async function sendPushNotification(userId, task, daysLeft, type, motivationalMsg) {
    const tokens = await getUserTokens(userId);
    if (tokens.length === 0) return;

    const deadlineDate = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
    const deadlineStr = deadlineDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    const title = type === 'urgent' ? `⚠️ Urgent: ${task.title}` : `⏰ ${task.title}`;
    const body = type === 'urgent'
        ? `Only ${daysLeft} day(s) left! Deadline: ${deadlineStr}`
        : `${daysLeft} days until deadline: ${deadlineStr}`;

    const fullBody = motivationalMsg ? `${body}\n\n${motivationalMsg}` : body;

    const message = {
        tokens: tokens,
        notification: { title, body: fullBody },
        webpush: {
            fcmOptions: { link: '/' },
            notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }
        }
    };

    try {
        const response = await getMessaging().sendEachForMulticast(message);
        if (response.failureCount > 0) {
            // Cleanup logic omitted for brevity in free version, but recommended
        }
    } catch (err) {
        console.error('Push failed:', err.message);
    }
}

// =============================================
//  MAIN FUNCTION (HTTPS)
// =============================================

exports.checkReminders = onRequest(async (req, reqRes) => {
    // 1. Security Check
    const key = req.query.key;
    if (key !== CRON_SECRET_KEY) {
        return reqRes.status(403).send('Forbidden: Invalid Key');
    }

    // 2. Quiet Hours Check
    if (isQuietHours()) {
        return reqRes.status(200).send('Quiet hours (11PM-7AM). No reminders sent.');
    }

    const isDailyRun = isMorningTime();
    const today = getTodayString();
    let stats = { daily: 0, urgent: 0, skipped: 0 };

    try {
        const tasksSnapshot = await db.collection('tasks').where('completed', '==', false).get();

        if (tasksSnapshot.empty) {
            return reqRes.status(200).send('No pending tasks.');
        }

        for (const taskDoc of tasksSnapshot.docs) {
            const task = taskDoc.data();
            const taskId = taskDoc.id;

            if (!task.deadline) { stats.skipped++; continue; }

            const daysLeft = getDaysLeft(task.deadline);
            const hoursLeft = getHoursLeft(task.deadline);

            // Skip expired
            if (hoursLeft <= 0) { stats.skipped++; continue; }

            const userEmail = await getUserEmail(task.userId);
            if (!userEmail) { stats.skipped++; continue; }

            const gender = await getUserGender(task.userId);
            const motivMsg = getMotivationalMessage(gender, task.userId);

            // ─── DAILY REMINDERS (Run only between 9-11 AM) ───
            if (isDailyRun) {
                // 7-Day Alert
                if (daysLeft === 7 && !task.notified7day) {
                    await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                    await sendPushNotification(task.userId, task, daysLeft, 'daily', motivMsg);
                    await db.collection('tasks').doc(taskId).update({
                        notified7day: true,
                        lastReminderSent: FieldValue.serverTimestamp()
                    });
                    stats.daily++;
                    continue;
                }

                // 5-6 Day Reminder (Once per day)
                if (daysLeft > 4 && daysLeft < 7) {
                    // Check if already sent today
                    if (task.lastReminderSent) {
                        const lastSent = task.lastReminderSent.toDate ? task.lastReminderSent.toDate() : new Date(task.lastReminderSent);
                        const sentUnadjusted = new Date(lastSent); // UTC
                        // Simple check: if last sent was < 20 hours ago
                        if ((new Date() - sentUnadjusted) < 20 * 60 * 60 * 1000) {
                            stats.skipped++;
                            continue;
                        }
                    }

                    await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                    await sendPushNotification(task.userId, task, daysLeft, 'daily', motivMsg);
                    await db.collection('tasks').doc(taskId).update({
                        lastReminderSent: FieldValue.serverTimestamp()
                    });
                    stats.daily++;
                    continue;
                }
            }

            // ─── URGENT REMINDERS (Run every execution if ≤ 4 days) ───
            if (daysLeft <= 4) {
                // Anti-Spam: Daily Cap Reset
                let sentToday = task.remindersSentToday || 0;
                if (task.lastReminderDay !== today) sentToday = 0;

                if (sentToday >= 6) { stats.skipped++; continue; } // Max 6/day

                // Anti-Spam: 2-Hour Window
                if (wasWithinHours(task.lastReminderSent, 2)) {
                    stats.skipped++;
                    continue;
                }

                // Send Urgent Reminder
                await sendReminderEmail(userEmail, task, daysLeft, 'urgent', motivMsg);
                await sendPushNotification(task.userId, task, daysLeft, 'urgent', motivMsg);

                await db.collection('tasks').doc(taskId).update({
                    lastReminderSent: FieldValue.serverTimestamp(),
                    remindersSentToday: sentToday + 1,
                    lastReminderDay: today
                });
                stats.urgent++;
            }
        }

        return reqRes.status(200).json({
            status: 'Success',
            mode: isDailyRun ? 'Daily + Urgent' : 'Urgent Only',
            stats: stats
        });

    } catch (error) {
        console.error('Error:', error);
        return reqRes.status(500).send('Internal Server Error: ' + error.message);
    }
});
