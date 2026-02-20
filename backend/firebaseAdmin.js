const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
// On Render, we'll use the FIREBASE_SERVICE_ACCOUNT environment variable
// Locally, we can use serviceAccountKey.json if it exists

let serviceAccount;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Render / Production: Use Env Var
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Local: Use file
        serviceAccount = require('./serviceAccountKey.json');
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('🔥 Firebase Admin initialized successfully');
    }
} catch (error) {
    console.error('❌ Firebase Admin init failed:', error.message);
    console.error('   Ensure FIREBASE_SERVICE_ACCOUNT env var is set or serviceAccountKey.json exists.');
}

const db = {
    collection: (name) => {
        if (!admin.apps.length) throw new Error("Firebase Admin not initialized.");
        return admin.firestore().collection(name);
    }
};

const messaging = {
    sendEachForMulticast: (message) => {
        if (!admin.apps.length) throw new Error("Firebase Admin not initialized.");
        return admin.messaging().sendEachForMulticast(message);
    }
};

module.exports = { admin, db, messaging };
