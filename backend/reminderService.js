const { db, messaging, admin } = require('./firebaseAdmin');
const { sendReminderEmail } = require('./mailer');
const { getMotivationalMessage } = require('./messageGenerator');
const moment = require('moment-timezone');

/**
 * Helper: Calculate days left
 */
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

/**
 * Helper: Check if date was within X hours
 */
function wasWithinHours(timestamp, hours) {
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return (new Date() - date) / (1000 * 60 * 60) < hours;
}

/**
 * Push Notification Sender
 */
async function sendPush(userId, task, daysLeft, type, motivMsg) {
    try {
        const tokensSnap = await db.collection('users').doc(userId).collection('tokens').get();
        if (tokensSnap.empty) return;

        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (tokens.length === 0) return;

        const deadlineDate = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
        const deadlineStr = deadlineDate.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });

        const title = type === 'urgent' ? `⚠️ Urgent: ${task.title}` : `⏰ ${task.title}`;
        const body = type === 'urgent'
            ? `Only ${daysLeft} day(s) left! Deadline: ${deadlineStr}`
            : `${daysLeft} days until deadline: ${deadlineStr}`;

        const fullBody = motivMsg ? `${body}\n\n${motivMsg}` : body;

        const message = {
            tokens: tokens,
            notification: { title, body: fullBody },
            data: { taskId: task.docId || '', type },
            webpush: {
                notification: {
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    vibrate: [200, 100, 200]
                },
                fcmOptions: { link: '/' }
            }
        };

        const response = await messaging.sendEachForMulticast(message);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error.code;
                    if (errCode === 'messaging/invalid-registration-token' ||
                        errCode === 'messaging/registration-token-not-registered') {
                        tokensSnap.docs[idx].ref.delete();
                    }
                }
            });
        }
    } catch (err) {
        console.error(`Error sending push to ${userId}:`, err.message);
    }
}

/**
 * MAIN REMINDER LOGIC
 */
async function runReminderChecks() {
    const now = new Date();

    // 1. Timezone & Quiet Hours Check (Asia/Kolkata)
    const istTime = moment().tz('Asia/Kolkata');
    const hour = istTime.hour();

    if (hour >= 23 || hour < 7) {
        return { status: 'skipped', message: `Quiet hours active (${hour}:00 IST)` };
    }

    // Check if it's "Morning" (9 AM - 10:59 AM IST) for Daily reminders
    const isDailyRun = (hour >= 9 && hour < 11);

    const todayStr = istTime.format('YYYY-MM-DD');
    let stats = { daily: 0, urgent: 0, skipped: 0 };

    try {
        const snapshot = await db.collection('tasks').where('completed', '==', false).get();
        if (snapshot.empty) return { status: 'success', message: 'No pending tasks', stats };

        for (const doc of snapshot.docs) {
            const task = doc.data();
            const taskId = doc.id;
            task.docId = taskId;

            if (!task.deadline) { stats.skipped++; continue; }

            const daysLeft = getDaysLeft(task.deadline);

            // Skip finished/expired (simple check)
            if (daysLeft < 0) { stats.skipped++; continue; }

            // Get User Info
            const userDoc = await db.collection('users').doc(task.userId).get();
            if (!userDoc.exists) { stats.skipped++; continue; }
            const userData = userDoc.data();
            const userEmail = await admin.auth().getUser(task.userId).then(u => u.email).catch(() => null);

            if (!userEmail) { stats.skipped++; continue; }

            const gender = userData.gender || 'male';
            const motivMsg = getMotivationalMessage(gender, task.userId);

            // ─── DAILY REMINDERS (9-11 AM IST) ───
            if (isDailyRun) {
                // 7-Day Alert
                if (daysLeft === 7 && !task.notified7day) {
                    await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                    await sendPush(task.userId, task, daysLeft, 'daily', motivMsg);
                    await db.collection('tasks').doc(taskId).update({
                        notified7day: true,
                        lastReminderSent: admin.firestore.FieldValue.serverTimestamp()
                    });
                    stats.daily++;
                    continue;
                }

                // 5-6 Day Reminder (Once per day)
                if (daysLeft > 4 && daysLeft < 7) {
                    // Check if sent in last 20 hours to prevent dupes
                    if (task.lastReminderSent) {
                        const lastSent = task.lastReminderSent.toDate ? task.lastReminderSent.toDate() : new Date(task.lastReminderSent);
                        const diffHours = (now - lastSent) / (1000 * 60 * 60);
                        if (diffHours < 20) { stats.skipped++; continue; }
                    }

                    await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                    await sendPush(task.userId, task, daysLeft, 'daily', motivMsg);
                    await db.collection('tasks').doc(taskId).update({
                        lastReminderSent: admin.firestore.FieldValue.serverTimestamp()
                    });
                    stats.daily++;
                    continue;
                }
            }

            // ─── URGENT REMINDERS (Every 2 Hours, ≤ 4 Days) ───
            if (daysLeft <= 4) {
                // Anti-Spam: Daily Limit
                let sentToday = task.remindersSentToday || 0;
                if (task.lastReminderDay !== todayStr) sentToday = 0;

                if (sentToday >= 6) { stats.skipped++; continue; }

                // Anti-Spam: 2-Hour Window
                if (wasWithinHours(task.lastReminderSent, 2)) { stats.skipped++; continue; }

                await sendReminderEmail(userEmail, task, daysLeft, 'urgent', motivMsg);
                await sendPush(task.userId, task, daysLeft, 'urgent', motivMsg);

                await db.collection('tasks').doc(taskId).update({
                    lastReminderSent: admin.firestore.FieldValue.serverTimestamp(),
                    remindersSentToday: sentToday + 1,
                    lastReminderDay: todayStr
                });
                stats.urgent++;
            }
        }

        return { status: 'success', stats, mode: isDailyRun ? 'Daily+Urgent' : 'Urgent Only' };

    } catch (error) {
        console.error('Logic Error:', error);
        throw error;
    }
}

module.exports = { runReminderChecks };
