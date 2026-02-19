/* =============================================
   LockYourAssIn — Dashboard JavaScript
   Firebase-Integrated Version
   ============================================= */

import {
  auth, db, messaging,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, where, orderBy, serverTimestamp, Timestamp,
  setDoc, getDoc,
  getToken, onMessage
} from './firebase.js';

// Top-level collection reference to prevent initialization errors
const tasksCollection = collection(db, 'tasks');

// =============================================
//  AUTH LOGIC
// =============================================

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authLoginBtn = document.getElementById('authLoginBtn');
const authRegisterBtn = document.getElementById('authRegisterBtn');
const authError = document.getElementById('authError');

let isRegisterMode = false;

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.add('visible');
  setTimeout(() => authError.classList.remove('visible'), 4000);
}

// Toggle between Login / Register
authRegisterBtn.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  authLoginBtn.textContent = isRegisterMode ? 'Create Account' : 'Log In';
  authRegisterBtn.innerHTML = isRegisterMode
    ? 'Already have an account? <strong>Log In</strong>'
    : "Don't have an account? <strong>Register</strong>";
  // Show/hide gender selector
  document.getElementById('genderGroup').style.display = isRegisterMode ? '' : 'none';
});

// Form submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  authLoginBtn.disabled = true;
  authLoginBtn.textContent = isRegisterMode ? 'Creating...' : 'Signing in...';

  try {
    if (isRegisterMode) {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      // Save gender to Firestore user profile
      const gender = document.querySelector('input[name="authGender"]:checked')?.value || 'male';
      await setDoc(doc(db, 'users', userCred.user.uid), {
        email: email,
        gender: gender,
        createdAt: serverTimestamp(),
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    const messages = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Wrong password. Try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/email-already-in-use': 'Email already registered. Log in instead.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email address.',
    };
    showAuthError(messages[err.code] || err.message);
  } finally {
    authLoginBtn.disabled = false;
    authLoginBtn.textContent = isRegisterMode ? 'Create Account' : 'Log In';
  }
});

// Auth state listener — guards the whole app
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.classList.add('hidden');
    appShell.style.display = '';

    // Auto-create user profile if it doesn't exist (for users registered before gender feature)
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        gender: 'male',
        createdAt: serverTimestamp(),
      });
      console.log('📝 Created user profile (default: male)');
    }

    initDashboard(user);
  } else {
    authScreen.classList.remove('hidden');
    appShell.style.display = 'none';
  }
});

// =============================================
//  FCM PUSH NOTIFICATION SETUP
// =============================================

let currentFcmToken = null;

/**
 * Request notification permission, generate FCM token,
 * and save it in Firestore for multi-device support
 */
async function setupPushNotifications(user) {
  if (!messaging) {
    console.warn('Push notifications not supported in this browser');
    return;
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    // Get the FCM service worker registration
    const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');

    // Generate FCM token
    // ⬇️ PASTE YOUR VAPID KEY BELOW (from Firebase Console → Cloud Messaging → Web Push certificates) ⬇️
    const VAPID_KEY = 'BKM7pF1THmSbDeTgtjN0-gTNrncjU3RR-S-Vd8AXiy-LfTpBDEHyrlFQX_ZLHi9A8irJgTec2pc2egBGZIEsc4k';

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.warn('No FCM token received');
      return;
    }

    currentFcmToken = token;
    console.log('🔔 FCM token generated');

    // Save token in Firestore: users/{uid}/tokens/{tokenHash}
    // Use a hash of the token as the doc ID to prevent duplicates
    const tokenHash = await hashToken(token);
    const tokenRef = doc(db, 'users', user.uid, 'tokens', tokenHash);

    const existing = await getDoc(tokenRef);
    if (!existing.exists()) {
      await setDoc(tokenRef, {
        token: token,
        createdAt: serverTimestamp(),
      });
      console.log('🔔 FCM token saved to Firestore (new device)');
    } else {
      console.log('🔔 FCM token already registered for this device');
    }

    // Handle foreground push notifications (when app is open)
    onMessage(messaging, (payload) => {
      console.log('🔔 Foreground push received:', payload);
      showPushToast(
        payload.notification?.title || 'Task Reminder',
        payload.notification?.body || 'You have a task deadline approaching.'
      );
    });

  } catch (err) {
    console.error('Push notification setup failed:', err);
  }
}

/**
 * Remove the current device's FCM token from Firestore on logout
 */
async function removeFcmToken(user) {
  if (!currentFcmToken || !user) return;
  try {
    const tokenHash = await hashToken(currentFcmToken);
    const tokenRef = doc(db, 'users', user.uid, 'tokens', tokenHash);
    await deleteDoc(tokenRef);
    console.log('🔔 FCM token removed (logged out)');
  } catch (err) {
    console.warn('Failed to remove FCM token:', err);
  }
}

/**
 * Generate a simple hash of a token string (for doc ID)
 */
async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

/**
 * Show a toast notification inside the app (for foreground pushes)
 */
function showPushToast(title, body) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 24px; right: 24px; z-index: 99999;
    background: var(--card-bg, #fff); color: var(--text, #333);
    border-radius: 14px; padding: 16px 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    border-left: 4px solid #e8772e;
    max-width: 360px; font-family: 'Inter', sans-serif;
    animation: slideInRight 0.3s ease;
  `;
  toast.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">🔔 ${title}</div>
    <div style="font-size:13px; color: var(--text-muted, #888);">${body}</div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// =============================================
//  DASHBOARD INIT (runs once per login)
// =============================================

let dashboardInitialized = false;


function initDashboard(user) {
  // Update user profile in sidebar
  const userName = document.querySelector('.user-name');
  const avatarText = document.querySelector('.avatar-text');
  const displayName = user.displayName || user.email.split('@')[0];
  if (userName) userName.textContent = displayName;
  if (avatarText) avatarText.textContent = displayName.charAt(0).toUpperCase();

  // Update greeting
  const greeting = document.querySelector('.greeting');
  if (greeting) {
    const hours = new Date().getHours();
    const timeGreeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';
    greeting.textContent = `${timeGreeting}, ${displayName.split(' ')[0]} 👋`;
  }

  // Setup push notifications for this user
  setupPushNotifications(user);

  // Only init event listeners once
  if (dashboardInitialized) {
    // Just reload tasks on re-auth
    loadFirestoreTasks(user.uid);
    return;
  }
  dashboardInitialized = true;

  // ——— DOM References ———
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburgerBtn');

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const hoursEl = document.getElementById('timerHours');
  const minutesEl = document.getElementById('timerMinutes');
  const secondsEl = document.getElementById('timerSeconds');

  const toggleAll = document.getElementById('toggleAll');
  const toggleUrgent = document.getElementById('toggleUrgent');
  const grid = document.getElementById('prioritiesGrid');

  const addCard = document.getElementById('addTaskCard');

  // ——— Today's Date Display ———
  const todayDateEl = document.getElementById('todayDate');
  if (todayDateEl) {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    todayDateEl.textContent = '📅  ' + now.toLocaleDateString('en-US', options);
  }

  // ——— Dark Mode Toggle ———
  const darkModeBtn = document.getElementById('darkModeBtn');
  const iconSun = darkModeBtn.querySelector('.icon-sun');
  const iconMoon = darkModeBtn.querySelector('.icon-moon');

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
    iconSun.style.display = 'none';
    iconMoon.style.display = 'block';
  }

  darkModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    iconSun.style.display = isDark ? 'none' : 'block';
    iconMoon.style.display = isDark ? 'block' : 'none';
  });

  // ——— Sidebar Toggle (Mobile) ———
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', openSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  // ——— Sidebar Nav — Page Switching ———
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pages = document.querySelectorAll('.page');

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');

      const target = item.dataset.page;
      pages.forEach((p) => p.classList.remove('active'));
      const targetPage = document.getElementById('page' + target.charAt(0).toUpperCase() + target.slice(1));
      if (targetPage) {
        targetPage.classList.add('active');
      } else {
        document.getElementById('pageDashboard').classList.add('active');
      }
      closeSidebar();
    });
  });

  // ——— Focus Timer (Count-Up Stopwatch) ———
  let elapsedSeconds = 0;
  let totalFocused = 0;
  let timerInterval = null;
  let isRunning = false;
  const timerSubtitle = document.querySelector('.timer-subtitle');

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateTimerDisplay() {
    const h = Math.floor(elapsedSeconds / 3600);
    const m = Math.floor((elapsedSeconds % 3600) / 60);
    const s = elapsedSeconds % 60;
    hoursEl.textContent = pad(h);
    minutesEl.textContent = pad(m);
    secondsEl.textContent = pad(s);
  }

  function updateFocusedToday() {
    const total = totalFocused + (isRunning ? elapsedSeconds : 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) {
      timerSubtitle.textContent = `${h}h ${m}m focused today`;
    } else {
      timerSubtitle.textContent = `${m}m focused today`;
    }
  }

  function startTimer() {
    isRunning = true;
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    playBtn.classList.add('paused');
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      updateTimerDisplay();
      updateFocusedToday();
    }, 1000);
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    playBtn.classList.remove('paused');
    totalFocused += elapsedSeconds;
    elapsedSeconds = 0;
    updateTimerDisplay();
    updateFocusedToday();
  }

  playBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  updateTimerDisplay();
  updateFocusedToday();

  // ——— Priority Toggle ———
  toggleAll.addEventListener('click', () => {
    toggleAll.classList.add('active');
    toggleUrgent.classList.remove('active');
    showTasks('all');
  });

  toggleUrgent.addEventListener('click', () => {
    toggleUrgent.classList.add('active');
    toggleAll.classList.remove('active');
    showTasks('urgent');
  });

  function showTasks(filter) {
    const cards = grid.querySelectorAll('.task-card');
    cards.forEach((card) => {
      if (filter === 'all') {
        card.style.display = '';
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = '';
        });
      } else {
        if (card.dataset.priority === 'high') {
          card.style.display = '';
          requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = '';
          });
        } else {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => {
            card.style.display = 'none';
          }, 250);
        }
      }
    });
  }

  // =============================================
  //  FIRESTORE TASKS — CRUD
  // =============================================



  // Create a dashboard task card element
  function createTaskCardEl(taskDoc) {
    const t = taskDoc.data ? taskDoc.data() : taskDoc;
    const id = taskDoc.id || taskDoc.docId || t.docId || '';
    const badgeClass = `badge-${t.priority}`;
    const badgeText = t.priority.toUpperCase();

    // Calculate time remaining
    let timeText = '';
    if (t.deadline) {
      const deadline = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
      const now = new Date();
      const diff = deadline - now;
      if (diff > 0) {
        const hours = Math.floor(diff / 3600000);
        if (hours >= 24) {
          timeText = Math.floor(hours / 24) + 'd left';
        } else {
          timeText = hours + 'h left';
        }
      } else {
        timeText = 'Overdue';
      }
    }

    const div = document.createElement('div');
    div.className = 'card task-card';
    div.dataset.priority = t.priority;
    div.dataset.docId = id;
    div.innerHTML = `
      <div class="task-top">
        <span class="priority-badge ${badgeClass}">${badgeText}</span>
        <button class="menu-btn" aria-label="Delete task">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      </div>
      <h3 class="task-title">${t.title}</h3>
      <p class="task-desc">${t.description || ''}</p>
      <div class="task-meta">
        <span class="time-remaining">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          ${timeText || 'No deadline'}
        </span>
      </div>
      <div class="task-bottom">
        <div class="progress-line">
          <div class="progress-fill" style="width:${t.completed ? '100' : '0'}%"></div>
        </div>
        <button class="complete-btn" aria-label="Mark complete">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </button>
      </div>
    `;

    // If already completed, show done state
    if (t.completed) {
      div.classList.add('task-done');
      const title = div.querySelector('.task-title');
      if (title) title.style.textDecoration = 'line-through';
    }

    // Complete button handler
    const completeBtn = div.querySelector('.complete-btn');
    completeBtn.addEventListener('click', async () => {
      if (div.classList.contains('task-done')) return;

      div.classList.add('task-done');
      const fill = div.querySelector('.progress-fill');
      if (fill) fill.style.width = '100%';
      const title = div.querySelector('.task-title');
      if (title) title.style.textDecoration = 'line-through';

      // Overlay
      const completionOverlay = document.createElement('div');
      completionOverlay.className = 'task-completed-overlay';
      completionOverlay.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2DA862" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="overlay-title">Task completed!</span>
        <span class="overlay-sub">You won't receive a reminder now.</span>
        <button class="undo-btn">Undo</button>
      `;
      div.appendChild(completionOverlay);
      requestAnimationFrame(() => completionOverlay.classList.add('visible'));

      // Update Firestore
      if (id) {
        try { await updateDoc(doc(db, 'tasks', id), { completed: true }); } catch (e) { console.error(e); }
      }

      // Undo handler
      completionOverlay.querySelector('.undo-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        completionOverlay.classList.remove('visible');
        setTimeout(() => {
          completionOverlay.remove();
          div.classList.remove('task-done');
          if (title) title.style.textDecoration = '';
          if (fill) fill.style.width = '0%';
        }, 300);
        if (id) {
          try { await updateDoc(doc(db, 'tasks', id), { completed: false }); } catch (e) { console.error(e); }
        }
      });
    });

    // Delete button handler
    const menuBtn = div.querySelector('.menu-btn');
    menuBtn.addEventListener('click', async () => {
      div.style.opacity = '0';
      div.style.transform = 'scale(0.95)';
      setTimeout(() => div.remove(), 300);
      if (id) {
        try { await deleteDoc(doc(db, 'tasks', id)); } catch (e) { console.error(e); }
      }
      // Also remove from allTasks
      const idx = allTasks.findIndex(x => x.docId === id);
      if (idx > -1) allTasks.splice(idx, 1);
      renderTasksPage();
    });

    return div;
  }

  // Render dashboard priority cards from Firestore data
  function renderDashboardCards() {
    // Remove existing task cards (keep the add-task card)
    grid.querySelectorAll('.task-card').forEach(c => c.remove());

    // Add cards for non-completed tasks
    allTasks.filter(t => !t.completed).forEach(t => {
      const el = createTaskCardEl(t);
      grid.appendChild(el);
    });
  }

  // =============================================
  //  TASKS PAGE (All Tasks list)
  // =============================================

  const tasksFullList = document.getElementById('tasksFullList');
  const tasksPills = document.querySelectorAll('.tasks-pill');

  // allTasks is now populated from Firestore
  let allTasks = [];
  let activeFilter = 'all';

  function renderTasksPage() {
    const filtered = activeFilter === 'all'
      ? allTasks
      : allTasks.filter(t => (t.priority || t.data?.priority) === activeFilter);

    if (filtered.length === 0) {
      tasksFullList.innerHTML = '<p class="al-empty">No tasks matching this filter.</p>';
      return;
    }

    tasksFullList.innerHTML = filtered.map((t, i) => {
      const task = t.data ? t.data() : t;
      const priority = task.priority || 'medium';
      let dueText = task.due || 'No due date';
      if (task.deadline && !task.due) {
        const d = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
        const opts = { month: 'short', day: 'numeric' };
        const timeOpts = { hour: 'numeric', minute: '2-digit' };
        dueText = d.toLocaleDateString('en-US', opts) + ', ' + d.toLocaleTimeString('en-US', timeOpts);
      }
      return `
        <div class="task-row ${task.completed ? 'row-done' : ''}" data-idx="${i}" data-priority="${priority}" data-doc-id="${t.docId || t.id || ''}">
          <button class="task-row-check ${task.completed ? 'checked' : ''}" aria-label="Complete task">✓</button>
          <span class="task-row-dot pr-${priority}"></span>
          <div class="task-row-info">
            <div class="task-row-name">${task.title || task.name}</div>
            <div class="task-row-due">📅 ${dueText}</div>
          </div>
          <span class="task-row-badge b-${priority}">${priority}</span>
        </div>
      `;
    }).join('');

    // Attach check handlers
    tasksFullList.querySelectorAll('.task-row-check').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.task-row');
        const isDone = row.classList.toggle('row-done');
        btn.classList.toggle('checked', isDone);

        const docId = row.dataset.docId;
        if (docId) {
          try { await updateDoc(doc(db, 'tasks', docId), { completed: isDone }); } catch (e) { console.error(e); }
        }
        // Update local
        const idx = parseInt(row.dataset.idx);
        if (allTasks[idx]) allTasks[idx].completed = isDone;
      });
    });
  }

  tasksPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tasksPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.filter;
      renderTasksPage();
    });
  });

  // =============================================
  //  LOAD TASKS FROM FIRESTORE
  // =============================================

  async function loadFirestoreTasks(uid) {
    try {
      // Query tasks by userId only (no orderBy to avoid composite index requirement)
      const q = query(tasksCollection, where('userId', '==', uid));
      const snapshot = await getDocs(q);

      allTasks = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allTasks.push({
          docId: docSnap.id,
          title: data.title,
          name: data.title, // alias for search/tasks page
          description: data.description || '',
          priority: data.priority,
          deadline: data.deadline,
          completed: data.completed || false,
          userId: data.userId,
          createdAt: data.createdAt,
          due: data.deadline ? formatDue(data.deadline) : 'No due date',
        });
      });

      // Sort by createdAt descending in JavaScript
      allTasks.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });

      // Populate calendar taskData from firestore tasks
      Object.keys(taskData).forEach(k => delete taskData[k]);
      allTasks.forEach(t => {
        if (t.deadline) {
          const d = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const timeOpts = { hour: 'numeric', minute: '2-digit' };
          if (!taskData[dateStr]) taskData[dateStr] = [];
          taskData[dateStr].push({
            name: t.title,
            time: d.toLocaleTimeString('en-US', timeOpts),
            priority: t.priority,
          });
        }
      });

      renderDashboardCards();
      renderTasksPage();
      renderCalendar();
      renderAnalytics();
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }

  function formatDue(deadline) {
    const d = deadline.toDate ? deadline.toDate() : new Date(deadline);
    const opts = { month: 'short', day: 'numeric' };
    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    return d.toLocaleDateString('en-US', opts) + ', ' + d.toLocaleTimeString('en-US', timeOpts);
  }

  // =============================================
  //  CALENDAR MODULE
  // =============================================

  const calGrid = document.getElementById('calGrid');
  const calMonthEl = document.getElementById('calMonth');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const detailPlaceholder = document.getElementById('detailPlaceholder');
  const detailContent = document.getElementById('detailContent');
  const detailDate = document.getElementById('detailDate');
  const detailTasks = document.getElementById('detailTasks');

  // taskData is now dynamically populated from Firestore
  const taskData = {};

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const now = new Date();
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  let selectedDay = null;

  function renderCalendar() {
    calGrid.innerHTML = '';
    calMonthEl.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      calGrid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = d;

      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d) {
        cell.classList.add('today');
      }

      if (taskData[dateStr]) {
        cell.classList.add('has-tasks');
        cell.addEventListener('click', () => {
          const prev = calGrid.querySelector('.cal-day.selected');
          if (prev) prev.classList.remove('selected');
          cell.classList.add('selected');
          showDayTasks(dateStr);
        });
      }

      calGrid.appendChild(cell);
    }

    detailPlaceholder.style.display = '';
    detailContent.style.display = 'none';
    selectedDay = null;
  }

  function showDayTasks(dateStr) {
    const tasks = taskData[dateStr];
    if (!tasks) return;
    selectedDay = dateStr;
    detailPlaceholder.style.display = 'none';
    detailContent.style.display = '';
    const dateObj = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    detailDate.textContent = dateObj.toLocaleDateString('en-US', options);
    detailTasks.innerHTML = tasks.map(t => `
      <div class="detail-task-item">
        <span class="detail-task-dot dot-${t.priority}"></span>
        <div class="detail-task-info">
          <div class="detail-task-name">${t.name}</div>
          <div class="detail-task-time">${t.time}</div>
        </div>
      </div>
    `).join('');
  }

  calPrev.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  calNext.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  renderCalendar();

  // =============================================
  //  ANALYTICS MODULE
  // =============================================

  const completedList = document.getElementById('completedTaskList');
  const missedList = document.getElementById('missedTaskList');
  const ringFill = document.getElementById('ringFill');
  const ringPercent = document.getElementById('ringPercent');
  const statCompleted = document.getElementById('statCompleted');
  const statMissed = document.getElementById('statMissed');
  const statTotal = document.getElementById('statTotal');

  // analyticsData now computed from allTasks
  const analyticsData = { completed: [], missed: [] };

  function renderAnalytics() {
    analyticsData.completed = allTasks.filter(t => t.completed);
    analyticsData.missed = allTasks.filter(t => {
      if (t.completed) return false;
      if (!t.deadline) return false;
      const d = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
      return d < new Date();
    });

    const total = allTasks.length;
    const done = analyticsData.completed.length;
    const missed = analyticsData.missed.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    statCompleted.textContent = done;
    statMissed.textContent = missed;
    statTotal.textContent = total;

    const circumference = 2 * Math.PI * 60;
    const offset = circumference - (pct / 100) * circumference;
    setTimeout(() => {
      ringFill.style.strokeDashoffset = offset;
      ringPercent.textContent = pct + '%';
    }, 200);

    if (done === 0) {
      completedList.innerHTML = '<p class="al-empty">No completed tasks yet.</p>';
    } else {
      completedList.innerHTML = analyticsData.completed.map(t => {
        let dueText = t.due || 'No date';
        if (dueText === 'No date' && t.deadline) {
          dueText = formatDue(t.deadline);
        }
        return `
        <div class="al-task-item">
          <span class="al-task-check check-done">✓</span>
          <div class="al-task-info">
            <div class="al-task-name">${t.title || t.name}</div>
            <div class="al-task-meta">${dueText} · ${(t.priority || 'medium').toUpperCase()}</div>
          </div>
          <span class="al-task-badge done-badge">Done</span>
        </div>
      `;
      }).join('');
    }

    if (missed === 0) {
      missedList.innerHTML = '<p class="al-empty">No missed tasks — great job!</p>';
    } else {
      missedList.innerHTML = analyticsData.missed.map(t => {
        let dueText = t.due || 'No date';
        if (dueText === 'No date' && t.deadline) {
          dueText = formatDue(t.deadline);
        }
        return `
        <div class="al-task-item">
          <span class="al-task-check check-miss">✗</span>
          <div class="al-task-info">
            <div class="al-task-name">${t.title || t.name}</div>
            <div class="al-task-meta">${dueText} · ${(t.priority || 'medium').toUpperCase()}</div>
          </div>
          <span class="al-task-badge miss-badge">Missed</span>
        </div>
      `;
      }).join('');
    }
  }

  // =============================================
  //  SIDEBAR PRIORITY FILTERS
  // =============================================

  const priorityFilters = document.querySelectorAll('.list-item[data-priority]');
  priorityFilters.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach((n) => n.classList.remove('active'));
      const dashNav = document.querySelector('.nav-item[data-page="dashboard"]');
      dashNav.classList.add('active');
      pages.forEach((p) => p.classList.remove('active'));
      document.getElementById('pageDashboard').classList.add('active');

      const wasActive = item.classList.contains('filter-active');
      priorityFilters.forEach((f) => f.classList.remove('filter-active'));

      const cards = grid.querySelectorAll('.task-card');
      if (wasActive) {
        cards.forEach((card) => {
          card.style.display = '';
          card.style.opacity = '1';
          card.style.transform = '';
        });
      } else {
        item.classList.add('filter-active');
        const filterPriority = item.dataset.priority;
        cards.forEach((card) => {
          if (card.dataset.priority === filterPriority) {
            card.style.display = '';
            requestAnimationFrame(() => {
              card.style.opacity = '1';
              card.style.transform = '';
            });
          } else {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => { card.style.display = 'none'; }, 250);
          }
        });
      }
      closeSidebar();
    });
  });

  // =============================================
  //  ADD TASK MODAL
  // =============================================

  const addTaskModal = document.getElementById('addTaskModal');
  const addTaskCloseBtn = document.getElementById('addTaskClose');
  const addTaskForm = document.getElementById('addTaskForm');
  const taskNameInput = document.getElementById('taskNameInput');
  const taskDueInput = document.getElementById('taskDueInput');
  const prOpts = document.querySelectorAll('.pr-opt');
  let selectedPriority = 'medium';

  addCard.addEventListener('click', () => {
    addTaskModal.classList.add('open');
    taskNameInput.focus();
  });

  function closeAddModal() {
    addTaskModal.classList.remove('open');
    addTaskForm.reset();
    prOpts.forEach(p => p.classList.remove('active'));
    document.querySelector('.pr-opt-medium').classList.add('active');
    selectedPriority = 'medium';
  }

  addTaskCloseBtn.addEventListener('click', closeAddModal);
  addTaskModal.addEventListener('click', (e) => {
    if (e.target === addTaskModal) closeAddModal();
  });

  prOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      prOpts.forEach(p => p.classList.remove('active'));
      opt.classList.add('active');
      selectedPriority = opt.dataset.pr;
    });
  });

  // Submit — creates Firestore document
  addTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = taskNameInput.value.trim();
    if (!name) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    let deadline = null;
    let dueText = 'No due date';
    if (taskDueInput.value) {
      deadline = Timestamp.fromDate(new Date(taskDueInput.value));
      const d = new Date(taskDueInput.value);
      const opts = { month: 'short', day: 'numeric' };
      const timeOpts = { hour: 'numeric', minute: '2-digit' };
      dueText = d.toLocaleDateString('en-US', opts) + ', ' + d.toLocaleTimeString('en-US', timeOpts);
    }

    const taskDoc = {
      title: name,
      description: '',
      priority: selectedPriority,
      deadline: deadline,
      completed: false,
      userId: currentUser.uid,
      createdAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(tasksCollection, taskDoc);

      // Add to local state
      const localTask = {
        docId: docRef.id,
        title: name,
        name: name,
        description: '',
        priority: selectedPriority,
        deadline: deadline,
        completed: false,
        userId: currentUser.uid,
        due: dueText,
      };
      allTasks.unshift(localTask);

      // Update all views
      renderDashboardCards();
      renderTasksPage();

      if (taskDueInput.value) {
        const dateStr = taskDueInput.value.split('T')[0];
        const d = new Date(taskDueInput.value);
        const timeOpts = { hour: 'numeric', minute: '2-digit' };
        const timeStr = d.toLocaleTimeString('en-US', timeOpts);
        if (!taskData[dateStr]) taskData[dateStr] = [];
        taskData[dateStr].push({ name, time: timeStr, priority: selectedPriority });
        renderCalendar();
      }

      // Notification
      notifications.unshift({
        text: `New task added: "${name}"`,
        time: 'Just now',
        type: 'task',
        unread: true,
      });
      renderNotifications();

    } catch (err) {
      console.error('Failed to add task:', err);
    }

    closeAddModal();
  });

  // =============================================
  //  SEARCH OVERLAY
  // =============================================

  const searchOverlay = document.getElementById('searchOverlay');
  const searchInputEl = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchCloseBtn = document.getElementById('searchClose');
  const searchBtn = document.getElementById('searchBtn');

  function getAllSearchableTasks() {
    return allTasks.map(t => ({
      name: t.title || t.name,
      due: t.due || 'No due date',
      priority: t.priority || 'medium',
    }));
  }

  function openSearch() {
    searchOverlay.classList.add('open');
    searchInputEl.value = '';
    searchResults.innerHTML = '<p class="search-hint">Start typing to search across all tasks...</p>';
    setTimeout(() => searchInputEl.focus(), 50);
  }

  function closeSearch() {
    searchOverlay.classList.remove('open');
  }

  searchBtn.addEventListener('click', openSearch);
  searchCloseBtn.addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      closeAddModal();
      closeNotifPanel();
    }
  });

  searchInputEl.addEventListener('input', () => {
    const q = searchInputEl.value.trim().toLowerCase();
    if (!q) {
      searchResults.innerHTML = '<p class="search-hint">Start typing to search across all tasks...</p>';
      return;
    }

    const tasks = getAllSearchableTasks();
    const matches = tasks.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.due.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      searchResults.innerHTML = '<p class="search-no-results">No tasks found for "' + q + '"</p>';
      return;
    }

    searchResults.innerHTML = matches.map(t => `
      <div class="search-result-item">
        <span class="sr-dot" style="background: var(--badge-${t.priority === 'high' ? 'high' : t.priority === 'medium' ? 'medium' : 'low'}-text);"></span>
        <span class="sr-name">${t.name}</span>
        <span class="sr-due">📅 ${t.due}</span>
      </div>
    `).join('');
  });

  // =============================================
  //  NOTIFICATIONS PANEL
  // =============================================

  const notifPanel = document.getElementById('notifPanel');
  const notifPanelOverlay = document.getElementById('notifPanelOverlay');
  const notifList = document.getElementById('notifList');
  const notifClear = document.getElementById('notifClear');
  const notifBtn = document.getElementById('notifBtn');
  const notifDot = document.querySelector('.notif-dot');

  const notifications = [
    { text: 'Welcome to LockYourAssIn! Start adding tasks.', time: 'Just now', type: 'task', unread: true },
  ];

  const typeIcons = { task: '✓', reminder: '🔔', alert: '⚠' };
  const typeClasses = { task: 'ni-task', reminder: 'ni-reminder', alert: 'ni-alert' };

  function renderNotifications() {
    if (notifications.length === 0) {
      notifList.innerHTML = '<p class="notif-empty">No notifications</p>';
      notifDot.style.display = 'none';
      return;
    }

    const hasUnread = notifications.some(n => n.unread);
    notifDot.style.display = hasUnread ? '' : 'none';

    notifList.innerHTML = notifications.map((n, i) => `
      <div class="notif-item ${n.unread ? 'unread' : ''}" data-idx="${i}">
        <div class="notif-icon ${typeClasses[n.type]}">${typeIcons[n.type]}</div>
        <div class="notif-info">
          <div class="notif-text">${n.text}</div>
          <div class="notif-time">${n.time}</div>
        </div>
        ${n.unread ? '<span class="notif-unread-dot"></span>' : ''}
      </div>
    `).join('');

    notifList.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        notifications[idx].unread = false;
        renderNotifications();
      });
    });
  }

  function openNotifPanel() {
    notifPanel.classList.add('open');
    notifPanelOverlay.classList.add('open');
  }

  function closeNotifPanel() {
    notifPanel.classList.remove('open');
    notifPanelOverlay.classList.remove('open');
  }

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifPanel.classList.contains('open')) {
      closeNotifPanel();
    } else {
      openNotifPanel();
    }
  });

  notifPanelOverlay.addEventListener('click', closeNotifPanel);

  notifClear.addEventListener('click', () => {
    notifications.length = 0;
    renderNotifications();
  });

  renderNotifications();

  // =============================================
  //  SETTINGS & LOGOUT
  // =============================================

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const modalLogoutBtn = document.getElementById('modalLogoutBtn');
  const settingsNameInput = document.getElementById('settingsName');
  const settingsGenderRadios = document.getElementsByName('settingsGender');

  // Open Settings
  if (settingsBtn) {
    settingsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      settingsModal.classList.add('open');

      // Prefill Name
      settingsNameInput.value = user.displayName || '';

      // Populate avatar and email in header
      const avatarEl = document.getElementById('settingsAvatar');
      const emailEl = document.getElementById('settingsEmail');
      if (avatarEl) {
        const text = avatarEl.querySelector('.settings-avatar-text');
        if (text) text.textContent = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
      }
      if (emailEl) emailEl.textContent = user.email || '';

      // Prefill Gender
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const gender = userDoc.data().gender || 'male';
          for (const radio of settingsGenderRadios) {
            if (radio.value === gender) radio.checked = true;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch gender:', err);
      }
    });
  }

  // Close Settings
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('open');
    });
  }

  // Close on outside click
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('open');
    }
  });

  // Save Settings
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      const newName = settingsNameInput.value.trim();
      const newGender = Array.from(settingsGenderRadios).find(r => r.checked)?.value || 'male';

      saveSettingsBtn.disabled = true;
      saveSettingsBtn.textContent = 'Saving...';

      try {
        const updates = [];

        // 1. Update Display Name (Firebase Auth)
        if (newName !== user.displayName) {
          updates.push(updateProfile(user, { displayName: newName }));
        }

        // 2. Update Gender & Name (Firestore)
        updates.push(setDoc(doc(db, 'users', user.uid), {
          gender: newGender,
          // We also save name to firestore just in case, though Auth is primary
          displayName: newName
        }, { merge: true }));

        await Promise.all(updates);

        // 3. Update UI immediately
        const userName = document.querySelector('.user-name');
        const avatarText = document.querySelector('.avatar-text');
        const greeting = document.querySelector('.greeting');

        if (userName) userName.textContent = newName || user.email.split('@')[0];
        if (avatarText) avatarText.textContent = (newName || user.email).charAt(0).toUpperCase();
        if (greeting) {
          const hours = new Date().getHours();
          const timeGreeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';
          greeting.textContent = `${timeGreeting}, ${newName.split(' ')[0]} 👋`;
        }

        // Close modal
        settingsModal.classList.remove('open');

        // Show success toast
        showPushToast('Settings Saved', 'Your profile has been updated successfully.');

      } catch (err) {
        console.error('Failed to save settings:', err);
        alert('Failed to save settings. Please try again.');
      } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Save Changes';
      }
    });
  }

  // Logout (from Modal)
  if (modalLogoutBtn) {
    modalLogoutBtn.addEventListener('click', async () => {
      try {
        await removeFcmToken(user);
        await signOut(auth);
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // =============================================
  //  INITIAL DATA LOAD
  // =============================================

  loadFirestoreTasks(user.uid);
}
