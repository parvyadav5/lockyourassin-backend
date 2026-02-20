const express = require('express');
const { runReminderChecks } = require('./reminderService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
const CRON_SECRET = process.env.CRON_SECRET || 'lockyourassin_secret_123';

app.get('/', (req, res) => {
    console.log(`[${new Date().toISOString()}] 🟢 Keep-alive ping received.`);
    res.status(200).send('LockYourAssIn Backend is Awake & Alive!');
});

// Trigger Endpoint
app.get('/run-reminder', (req, res) => {
    const key = req.query.key;

    // 1. Validate Secret
    if (key !== CRON_SECRET) {
        return res.status(403).json({ error: 'Forbidden: Invalid Key' });
    }

    console.log(`[${new Date().toISOString()}] Reminder triggered`);

    // 2. Respond immediately to prevent timeout/hanging
    res.status(200).send("Reminder job started");

    // 3. Run Logic in Background
    runReminderChecks()
        .then(result => {
            console.log(`[${new Date().toISOString()}] Reminder finished successfully. Result:`, result);
        })
        .catch(error => {
            console.error(`[${new Date().toISOString()}] Background reminder error:`, error);
        });
});

app.listen(PORT, () => {
    console.log(`
      🚀 Server running on port ${PORT}
      👉 Trigger URL: http://localhost:${PORT}/run-reminder?key=${CRON_SECRET}
    `);
});
