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
app.get('/run-reminder', async (req, res) => {
    const key = req.query.key;

    // 1. Validate Secret
    if (key !== CRON_SECRET) {
        return res.status(403).json({ error: 'Forbidden: Invalid Key' });
    }

    console.log(`[${new Date().toISOString()}] Triggered reminder check...`);

    try {
        // 2. Run Logic
        const result = await runReminderChecks();
        console.log('Result:', result);
        res.status(200).json(result);
    } catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
      🚀 Server running on port ${PORT}
      👉 Trigger URL: http://localhost:${PORT}/run-reminder?key=${CRON_SECRET}
    `);
});
