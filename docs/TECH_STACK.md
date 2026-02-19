# LockYourAssIn — Tech Stack Document

## Overview

LockYourAssIn is built as a **serverless Progressive Web App (PWA)** with a Firebase backend. No traditional server is needed — the frontend is static HTML/CSS/JS, and all backend logic runs as Firebase Cloud Functions.

---

## Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **HTML5** | — | Semantic page structure, modals, forms |
| **CSS3** | — | Custom design system with CSS variables, animations, responsive grid |
| **Vanilla JavaScript** | ES2020+ | All client-side logic (no framework) |
| **Firebase JS SDK** | v11.4.0 | Auth, Firestore, Cloud Messaging (via CDN ESM imports) |

### Key Frontend Decisions
- **No React/Vue/Angular** — pure vanilla JS for simplicity, zero build step, and fast load times
- **CSS Variables** — centralized theming via `--text-primary`, `--card-bg`, `--border`, etc.
- **ES Modules** — `firebase.js` uses `import` from `gstatic.com` CDN (no bundler needed)
- **Single HTML page** — all views (Dashboard, Calendar, Analytics, Tasks) rendered client-side

---

## Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Firebase Cloud Functions** | v5.x (v2 API) | Scheduled reminder tasks |
| **Firebase Admin SDK** | v12.x | Server-side Firestore, Auth, FCM access |
| **Node.js** | 18 | Cloud Functions runtime |
| **nodemailer** | v6.9.x | Gmail SMTP email delivery |

### Cloud Functions Architecture
```
functions/
├── index.js            ← onSchedule() entry points
├── mailer.js           ← nodemailer email sender
├── messageGenerator.js ← gender-based motivational messages
├── package.json        ← dependencies
└── .env                ← EMAIL_USER, EMAIL_PASS
```

---

## Firebase Services

| Service | Purpose | Plan Required |
|---------|---------|---------------|
| **Authentication** | Email/password sign-up and sign-in | Spark (Free) |
| **Cloud Firestore** | NoSQL database for tasks, user profiles, FCM tokens | Spark (Free, up to limits) |
| **Cloud Messaging (FCM)** | Push notifications to all user devices | Spark (Free) |
| **Cloud Functions** | Scheduled reminders (daily + every 2 hours) | **Blaze (Pay-as-you-go)** |

---

## PWA Stack

| Component | File | Purpose |
|-----------|------|---------|
| **Web App Manifest** | `manifest.json` | App name, icons, theme color, display mode |
| **Service Worker** | `service-worker.js` | Static asset caching for offline support |
| **FCM Service Worker** | `firebase-messaging-sw.js` | Background push notification handling |
| **App Icons** | `icons/icon-192.png`, `icons/icon-512.png` | PWA install icons |

---

## External Services

| Service | Purpose | Credentials |
|---------|---------|-------------|
| **Gmail SMTP** | Send reminder emails via nodemailer | App Password (16-char) in `.env` |
| **Firebase Console** | Project management, Firestore rules, function monitoring | Google Account |

---

## Development Tools

| Tool | Purpose |
|------|---------|
| **Python HTTP Server** | Local development (`python3 -m http.server 8000`) |
| **Firebase CLI** | Deploy Cloud Functions, manage emulators |
| **Firebase Emulator Suite** | Local testing of Cloud Functions |

---

## File Structure

```
LockYourAssIn/
├── index.html                  ← Main app (single page)
├── styles.css                  ← Full design system (~2300 lines)
├── script.js                   ← App logic (~1390 lines)
├── firebase.js                 ← Firebase SDK init + exports
├── service-worker.js           ← PWA offline caching
├── firebase-messaging-sw.js    ← Background push handler
├── manifest.json               ← PWA manifest
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── functions/                  ← Firebase Cloud Functions
│   ├── index.js
│   ├── mailer.js
│   ├── messageGenerator.js
│   ├── package.json
│   └── .env
├── backend/                    ← Legacy Node.js backend (node-cron)
│   ├── server.js
│   ├── scheduler.js
│   ├── mailer.js
│   ├── messages.js
│   ├── firebaseAdmin.js
│   ├── package.json
│   ├── .env
│   └── serviceAccountKey.json
└── docs/
    ├── PRD.md
    ├── DESIGN.md
    └── TECH_STACK.md
```

---

## Deployment

| Component | Hosting | How |
|-----------|---------|-----|
| Frontend (HTML/CSS/JS) | Firebase Hosting / GitHub Pages / any static host | `firebase deploy --only hosting` or push to GitHub |
| Cloud Functions | Firebase Cloud Functions | `firebase deploy --only functions` |
| Database | Firebase Firestore | Managed (no deployment needed) |
| Auth | Firebase Authentication | Managed (no deployment needed) |

### Deployment Commands
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (first time only)
firebase init hosting functions

# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 90+ | ✅ Full (Push + PWA) |
| Edge 90+ | ✅ Full |
| Firefox 100+ | ✅ Partial (no PWA install on desktop) |
| Safari 16+ | ✅ Partial (Push support added in Safari 16) |
| Mobile Chrome | ✅ Full |
| Mobile Safari | ✅ Partial (PWA install + limited push) |
