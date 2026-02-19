// =============================================
//  Scheduler — Smart Anti-Spam Reminder System
//  ─────────────────────────────────────────────
//  • Daily cron (9 AM) → 7-day + days 5-7
//  • Urgent cron (every 2 hrs) → days ≤4
//  • Quiet hours: 11 PM – 7 AM (no emails)
//  • Max 6 emails per task per day
//  • 2-hour duplicate prevention window
//  • Push notifications to ALL user devices
// =============================================

const cron = require('node-cron');
const { db, admin } = require('./firebaseAdmin');
const { sendReminderEmail } = require('./mailer');
const { getMotivationalMessage } = require('./messages');

// =============================================
//  HELPERS
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
    const hour = new Date().getHours();
    return hour >= 23 || hour < 7;
}

async function getUserEmail(userId) {
    try {
        const userRecord = await admin.auth().getUser(userId);
        return userRecord.email;
    } catch (err) {
        return null;
    }
}

/**
 * Get user gender from Firestore user profile
 */
async function getUserGender(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data().gender || 'male';
        }
        return 'male'; // default
    } catch (err) {
        return 'male';
    }
}

// =============================================
//  PUSH NOTIFICATION — MULTI-DEVICE
// =============================================

/**
 * Get all FCM tokens for a user from Firestore
 */
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
        console.warn(`  ⚠️  Could not fetch tokens for user ${userId}:`, err.message);
        return [];
    }
}

/**
 * Send push notification to ALL user devices
 */
async function sendPushNotification(userId, task, daysLeft, type, motivationalMsg = '') {
    const tokens = await getUserTokens(userId);
    if (tokens.length === 0) {
        console.log(`  📵 No FCM tokens for user ${userId}, push skipped`);
        return;
    }

    const deadlineDate = task.deadline.toDate
        ? task.deadline.toDate()
        : new Date(task.deadline);

    const deadlineStr = deadlineDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    const title = type === 'urgent'
        ? `⚠️ Urgent: ${task.title}`
        : `⏰ ${task.title}`;

    const body = type === 'urgent'
        ? `Only ${daysLeft} day(s) left! Deadline: ${deadlineStr}`
        : `${daysLeft} day(s) until deadline: ${deadlineStr}`;

    // Add motivational message if provided
    const fullBody = motivationalMsg ? `${body}\n\n${motivationalMsg}` : body;

    const message = {
        tokens: tokens,
        notification: {
            title: title,
            body: fullBody,
        },
        data: {
            taskId: task.docId || '',
            type: type,
            priority: task.priority || 'medium',
        },
        webpush: {
            fcmOptions: {
                link: '/',
            },
            notification: {
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                vibrate: [200, 100, 200],
            },
        },
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`  📲 Push sent to ${response.successCount}/${tokens.length} device(s)`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const tokensSnapshot = await db
                .collection('users')
                .doc(userId)
                .collection('tokens')
                .get();

            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered'
                    ) {
                        // Remove stale token
                        const staleDoc = tokensSnapshot.docs[idx];
                        if (staleDoc) {
                            staleDoc.ref.delete();
                            console.log(`  🗑️  Removed stale token`);
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error(`  ❌ Push notification failed:`, err.message);
    }
}

// =============================================
//  DAILY REMINDER CHECK (7-day + days 5-7)
// =============================================

async function checkDailyReminders() {
    console.log('\n📋 [DAILY] Running reminder check at', new Date().toLocaleString());
    console.log('─'.repeat(50));

    try {
        const tasksSnapshot = await db
            .collection('tasks')
            .where('completed', '==', false)
            .get();

        if (tasksSnapshot.empty) {
            console.log('  No pending tasks found.');
            return;
        }

        console.log(`  Found ${tasksSnapshot.size} pending task(s)`);

        let emailsSent = 0;
        let skipped = 0;

        for (const taskDoc of tasksSnapshot.docs) {
            const task = taskDoc.data();
            const taskId = taskDoc.id;

            if (!task.deadline) { skipped++; continue; }

            const daysLeft = getDaysLeft(task.deadline);

            if (daysLeft <= 0) {
                console.log(`  ⏭  "${task.title}" — deadline passed, skipping`);
                skipped++;
                continue;
            }

            const userEmail = await getUserEmail(task.userId);
            if (!userEmail) {
                console.log(`  ⚠️  Could not find user ${task.userId}, skipping "${task.title}"`);
                skipped++;
                continue;
            }

            // === 7-DAY REMINDER ===
            if (daysLeft === 7 && !task.notified7day) {
                console.log(`  📬 "${task.title}" — exactly 7 days left, sending 7-day reminder`);

                const gender = await getUserGender(task.userId);
                const motivMsg = getMotivationalMessage(gender, task.userId);

                await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                await sendPushNotification(task.userId, task, daysLeft, 'daily', motivMsg);

                await db.collection('tasks').doc(taskId).update({
                    notified7day: true,
                    lastDailyReminderSent: admin.firestore.FieldValue.serverTimestamp(),
                });

                emailsSent++;
                continue;
            }

            // === DAILY REMINDERS (5-7 days) ===
            if (daysLeft > 4 && daysLeft < 7) {
                if (task.lastDailyReminderSent) {
                    const lastSent = task.lastDailyReminderSent.toDate
                        ? task.lastDailyReminderSent.toDate()
                        : new Date(task.lastDailyReminderSent);

                    const today = new Date();
                    if (
                        lastSent.getFullYear() === today.getFullYear() &&
                        lastSent.getMonth() === today.getMonth() &&
                        lastSent.getDate() === today.getDate()
                    ) {
                        console.log(`  ✅ "${task.title}" — already reminded today, skipping`);
                        skipped++;
                        continue;
                    }
                }

                console.log(`  📬 "${task.title}" — ${daysLeft} day(s) left, sending daily reminder`);

                const gender = await getUserGender(task.userId);
                const motivMsg = getMotivationalMessage(gender, task.userId);

                await sendReminderEmail(userEmail, task, daysLeft, 'daily', motivMsg);
                await sendPushNotification(task.userId, task, daysLeft, 'daily', motivMsg);

                await db.collection('tasks').doc(taskId).update({
                    lastDailyReminderSent: admin.firestore.FieldValue.serverTimestamp(),
                });

                emailsSent++;
                continue;
            }

            skipped++;
        }

        console.log('─'.repeat(50));
        console.log(`  📊 [DAILY] Summary: ${emailsSent} email(s) + push sent, ${skipped} skipped`);

    } catch (error) {
        console.error('❌ Daily reminder check failed:', error.message);
    }
}

// =============================================
//  2-HOUR URGENT CHECK — with Anti-Spam Rules
// =============================================

async function checkUrgentReminders() {
    console.log('\n🚨 [URGENT] Running 2-hour check at', new Date().toLocaleString());
    console.log('─'.repeat(50));

    // Quiet hours check
    if (isQuietHours()) {
        const hour = new Date().getHours();
        console.log(`  🌙 Quiet hours active (${hour}:00). No messages sent (11 PM – 7 AM).`);
        return;
    }

    try {
        const tasksSnapshot = await db
            .collection('tasks')
            .where('completed', '==', false)
            .get();

        if (tasksSnapshot.empty) {
            console.log('  No pending tasks found.');
            return;
        }

        let sent = 0;
        let skipped = 0;
        const today = getTodayString();

        for (const taskDoc of tasksSnapshot.docs) {
            const task = taskDoc.data();
            const taskId = taskDoc.id;

            if (!task.deadline) { skipped++; continue; }

            const daysLeft = getDaysLeft(task.deadline);
            const hoursLeft = getHoursLeft(task.deadline);

            if (hoursLeft <= 0) {
                console.log(`  ⏭  "${task.title}" — deadline passed, skipping`);
                skipped++;
                continue;
            }

            if (daysLeft > 4) { skipped++; continue; }

            // Reset daily counter if day changed
            let emailsSentToday = task.emailsSentToday || 0;
            const lastEmailDay = task.lastEmailDay || '';
            if (lastEmailDay !== today) emailsSentToday = 0;

            // Max 6 per day
            if (emailsSentToday >= 6) {
                console.log(`  🛑 "${task.title}" — daily limit reached (${emailsSentToday}/6), skipping`);
                skipped++;
                continue;
            }

            // 2-hour duplicate window
            if (wasWithinHours(task.last2HourReminderSent, 2)) {
                console.log(`  ✅ "${task.title}" — already reminded within 2 hours, skipping`);
                skipped++;
                continue;
            }

            // Get user email
            const userEmail = await getUserEmail(task.userId);
            if (!userEmail) {
                console.log(`  ⚠️  Could not find user ${task.userId}, skipping "${task.title}"`);
                skipped++;
                continue;
            }

            // Send email + push
            const hoursDisplay = Math.max(1, Math.round(hoursLeft));
            console.log(`  🚨 "${task.title}" — ${daysLeft}d ${hoursDisplay}h left, sending URGENT (${emailsSentToday + 1}/6 today)`);

            const gender = await getUserGender(task.userId);
            const motivMsg = getMotivationalMessage(gender, task.userId);

            await sendReminderEmail(userEmail, task, daysLeft, 'urgent', motivMsg);
            await sendPushNotification(task.userId, task, daysLeft, 'urgent', motivMsg);

            await db.collection('tasks').doc(taskId).update({
                last2HourReminderSent: admin.firestore.FieldValue.serverTimestamp(),
                emailsSentToday: emailsSentToday + 1,
                lastEmailDay: today,
            });

            sent++;
        }

        console.log('─'.repeat(50));
        console.log(`  📊 [URGENT] Summary: ${sent} email(s) + push sent, ${skipped} skipped`);

    } catch (error) {
        console.error('❌ Urgent reminder check failed:', error.message);
    }
}

// =============================================
//  START BOTH SCHEDULERS
// =============================================

function startScheduler() {
    console.log('⏰ Schedulers started:');
    console.log('   📅 Daily reminders    → every day at 9:00 AM');
    console.log('   🚨 Urgent reminders   → every 2 hours (7 AM – 11 PM)');
    console.log('   🌙 Quiet hours        → 11 PM – 7 AM (no messages)');
    console.log('   🛑 Daily limit        → max 6 per task per day');
    console.log('   📲 Push notifications → all user devices');

    cron.schedule('0 9 * * *', () => { checkDailyReminders(); });
    cron.schedule('0 */2 * * *', () => { checkUrgentReminders(); });

    console.log('\n🔄 Running initial checks...');
    checkDailyReminders();
    setTimeout(() => { checkUrgentReminders(); }, 3000);
}

module.exports = { startScheduler, checkDailyReminders, checkUrgentReminders };
