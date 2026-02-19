# LockYourAssIn — Product Requirement Document (PRD)

## 1. Product Overview

**LockYourAssIn** is a productivity-focused task tracking web application designed to help users stay disciplined, manage deadlines, and receive intelligent reminders. It combines a beautiful dashboard UI with aggressive, motivational reminder systems to ensure tasks are completed on time.

**Tagline:** *Stay consistent, stay locked in.*

---

## 2. Target Users

- Students managing assignments and project deadlines
- Professionals tracking work tasks and deliverables
- Self-disciplined individuals who want accountability via reminders
- Anyone who benefits from motivational nudges and deadline pressure

---

## 3. Core Features

### 3.1 Authentication
| Requirement | Details |
|-------------|---------|
| Sign Up | Email + password registration with display name |
| Sign In | Email + password login |
| Session Persistence | User stays logged in across browser sessions |
| Profile Management | Update display name, gender via Settings modal |
| Logout | Sign out from Settings modal |

### 3.2 Task Management
| Requirement | Details |
|-------------|---------|
| Create Task | Title, deadline (date + time), priority (High/Medium/Low) |
| Edit Task | Inline editing of title, deadline, priority |
| Delete Task | Remove task with confirmation |
| Complete Task | Mark as done (checkbox toggle) |
| Priority Filter | Filter tasks by High, Medium, Low, or All |
| Sorting | Tasks ordered by deadline (soonest first) |

### 3.3 Dashboard
| Requirement | Details |
|-------------|---------|
| Greeting | Dynamic greeting with user's name + time of day |
| Daily Progress | Visual streak tracker (Mon–Sun) with check marks |
| Focus Timer | Pomodoro-style countdown timer with session tagging |
| Priorities Board | Task cards showing title, deadline, priority badge |
| Calendar View | Monthly calendar with task dots on deadline dates |
| Analytics View | Completed vs. missed task breakdown with stats |

### 3.4 Automated Reminder System
| Requirement | Details |
|-------------|---------|
| 7-Day Notice | One-time email + push when deadline is exactly 7 days away |
| Daily Reminders | Daily email + push for tasks 5–7 days out |
| Urgent Reminders | Every 2 hours for tasks ≤4 days away |
| Quiet Hours | No reminders between 11 PM – 7 AM |
| Daily Cap | Max 6 reminders per task per day |
| Dedup Window | No duplicate reminders within 2-hour window |
| Gender Messages | Motivational messages based on user's gender profile |

### 3.5 Push Notifications
| Requirement | Details |
|-------------|---------|
| Permission Request | Browser notification permission on login |
| FCM Integration | Firebase Cloud Messaging for reliable delivery |
| Multi-Device | Push sent to all registered devices |
| Token Cleanup | Stale/invalid tokens auto-removed |
| Background Support | Notifications received when app is not in foreground |

### 3.6 Email Reminders
| Requirement | Details |
|-------------|---------|
| Gmail SMTP | Sent via nodemailer with App Password |
| HTML Template | Branded email with task details, urgency level, motivational quote |
| Two Types | Regular (daily) and Urgent (2-hour) with different styling |

### 3.7 PWA Support
| Requirement | Details |
|-------------|---------|
| Installable | Web app manifest with icons (192px, 512px) |
| Offline Cache | Service worker caches static assets |
| App-Like | Standalone display mode, custom theme color |

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Dashboard loads in < 2 seconds on 4G |
| Security | Firestore rules restrict data to authenticated owner |
| Reliability | Cloud Functions auto-retry on failure |
| Scalability | Serverless backend scales with user count |
| Accessibility | Keyboard navigable, readable fonts, high contrast |
| Mobile | Fully responsive layout (320px–2560px) |

---

## 5. Out of Scope (v1)

- Team/shared task boards
- File attachments on tasks
- Recurring/repeating tasks
- Third-party calendar sync (Google Calendar, Outlook)
- Native mobile app (iOS/Android)
- Dark mode toggle (currently light theme only)

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Task completion rate | > 70% of created tasks completed before deadline |
| Reminder open rate | > 40% of push notifications clicked |
| User retention (7-day) | > 60% of registered users return within a week |
| Avg. tasks per user | > 3 active tasks at any time |
