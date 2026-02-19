# LockYourAssIn — Design Document

## 1. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                  │
│                                                      │
│  index.html + styles.css + script.js + firebase.js   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   Auth   │  │  Tasks   │  │  Push Permission   │  │
│  │  (Login) │  │  (CRUD)  │  │  (FCM Token Save)  │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
└───────┼──────────────┼─────────────────┼──────────────┘
        │              │                 │
        ▼              ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                 FIREBASE SERVICES                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Auth        │  │  Firestore   │  │  FCM      │  │
│  │  (Email/Pwd) │  │  (Database)  │  │  (Push)   │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Cloud Functions (Scheduled)                  │   │
│  │  ┌──────────────┐  ┌───────────────────────┐  │   │
│  │  │ Daily 9AM    │  │ Urgent Every 2 Hours  │  │   │
│  │  │ (7-day +     │  │ (≤4 days, anti-spam)  │  │   │
│  │  │  daily 5-7d) │  │                       │  │   │
│  │  └──────┬───────┘  └──────────┬────────────┘  │   │
│  │         │                     │                │   │
│  │         ▼                     ▼                │   │
│  │  ┌──────────────┐  ┌───────────────────────┐  │   │
│  │  │ Email via    │  │ Push via FCM          │  │   │
│  │  │ Gmail SMTP   │  │ sendEachForMulticast  │  │   │
│  │  └──────────────┘  └───────────────────────┘  │   │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 2. Firestore Data Model

### `tasks` Collection
```
tasks/{taskId}
├── title:               string      "Math Assignment"
├── priority:            string      "high" | "medium" | "low"
├── deadline:            timestamp   2026-02-25T23:59:00Z
├── completed:           boolean     false
├── userId:              string      "abc123..."
├── createdAt:           timestamp   (server timestamp)
├── notified7day:        boolean     false (set true after 7-day alert)
├── lastReminderSent:    timestamp   (anti-spam: last send time)
├── remindersSentToday:  number      0–6 (anti-spam: daily cap)
└── lastReminderDay:     string      "2026-02-19" (reset detection)
```

### `users` Collection
```
users/{userId}
├── displayName:   string   "Parv Yadav"
├── gender:        string   "male" | "female"
└── tokens/                 (subcollection)
    └── {tokenId}
        └── token: string   "fcm-token-abc123..."
```

---

## 3. UI Layout Structure

### Page Views (Single-Page App)
```
┌─────────────────────────────────────────────────┐
│ SIDEBAR (240px)  │  MAIN CONTENT AREA           │
│                  │                               │
│ ▪ Logo/Brand     │  ┌─────────────────────────┐  │
│ ▪ Dashboard      │  │ Header Bar              │  │
│ ▪ Calendar       │  │ Greeting + Theme + Notif │  │
│ ▪ Analytics      │  ├─────────────────────────┤  │
│ ▪ Tasks          │  │ View Content            │  │
│                  │  │ (Dashboard / Calendar / │  │
│ PRIORITY FILTER  │  │  Analytics / Tasks)     │  │
│ ▪ High           │  │                         │  │
│ ▪ Medium         │  │                         │  │
│ ▪ Low            │  │                         │  │
│                  │  └─────────────────────────┘  │
│ ─────────────    │                               │
│ ⚙ Settings      │                               │
│ 👤 User Profile  │                               │
└─────────────────────────────────────────────────┘
```

### Dashboard View Components
| Component | Position | Purpose |
|-----------|----------|---------|
| Greeting Card | Top-left | Dynamic hello + date |
| Focus Timer | Top-right | Pomodoro countdown with session tags |
| Daily Progress | Below greeting | Mon–Sun streak visualization |
| Priorities Board | Center | Task cards grid with add button |

### Settings Modal
| Element | Purpose |
|---------|---------|
| Profile Avatar | User initial with gradient background |
| Email Display | Shows authenticated email |
| Display Name Input | Editable name field |
| Gender Pills | Male/Female radio selectors |
| Save / Logout Buttons | Footer actions |

---

## 4. Reminder System Flow

```
                          Task Created
                              │
                              ▼
                    ┌───────────────────┐
                    │ Days until deadline │
                    └────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Days = 7      7 > Days > 4    Days ≤ 4
              │              │              │
              ▼              ▼              ▼
        One-time 7-day   Daily at 9AM   Every 2 hours
        email + push     email + push   email + push
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                              Anti-Spam      Gender Msg
                              Checks         Selection
                              │                  │
                    ┌─────────┼─────────┐        │
                    ▼         ▼         ▼        │
              Quiet Hrs  6/day Cap  2h Dedup     │
              11PM-7AM   Counter   Window        │
                                                 │
                                    ┌────────────┘
                                    ▼
                              Email + Push
                              Delivered
```

---

## 5. Authentication Flow

```
App Load → onAuthStateChanged()
    │
    ├── User Signed In → Show Dashboard, load tasks
    │
    └── No User → Show Login/Signup form
                      │
                      ├── Sign Up → createUserWithEmailAndPassword()
                      │              → updateProfile(displayName)
                      │              → Redirect to Dashboard
                      │
                      └── Sign In → signInWithEmailAndPassword()
                                   → Redirect to Dashboard
```

---

## 6. Push Notification Flow

```
User Logs In
    │
    ▼
Request Notification Permission
    │
    ├── Granted → getToken(messaging, { vapidKey })
    │              │
    │              ▼
    │         Save token to Firestore:
    │         users/{uid}/tokens/{hash}
    │              │
    │              ▼
    │         Listen: onMessage() for foreground
    │         Service Worker handles background
    │
    └── Denied → Skip push (email-only reminders)
```

---

## 7. Security Model

| Layer | Protection |
|-------|-----------|
| Authentication | Firebase Auth (email/password) |
| Data Isolation | Firestore rules: each user can only read/write their own tasks |
| Token Security | FCM tokens stored per-user with UID-scoped access |
| API Keys | Firebase config is client-safe (restricted by domain) |
| SMTP Credentials | Stored in Cloud Functions `.env`, never exposed to client |
| Service Account | `serviceAccountKey.json` excluded from git via `.gitignore` |
