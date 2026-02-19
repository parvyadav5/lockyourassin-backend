// =============================================
//  Firebase Configuration — LockYourAssIn
// =============================================
//
//  HOW TO SET UP:
//  1. Go to https://console.firebase.google.com
//  2. Create a new project (or use existing)
//  3. Enable Authentication → Email/Password
//  4. Enable Cloud Firestore (start in test mode, then apply rules below)
//  5. Enable Cloud Messaging (for push notifications)
//  6. Go to Project Settings → Your Apps → Add Web App
//  7. Copy the config object and paste below
//
//  FIRESTORE SECURITY RULES (paste in Firestore → Rules):
//
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//      match /tasks/{taskId} {
//        allow read, update, delete: if request.auth != null
//          && resource.data.userId == request.auth.uid;
//        allow create: if request.auth != null
//          && request.resource.data.userId == request.auth.uid;
//      }
//      match /users/{userId} {
//        allow read, write: if request.auth != null
//          && request.auth.uid == userId;
//        match /tokens/{tokenId} {
//          allow read, write: if request.auth != null
//            && request.auth.uid == userId;
//        }
//      }
//    }
//  }
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, Timestamp, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging.js";

// ⬇️ PASTE YOUR FIREBASE CONFIG HERE ⬇️
const firebaseConfig = {
    apiKey: "AIzaSyBI2KiFFcO45htNnRtV-7BNS-C_IRVcfKQ",
    authDomain: "lockyourassin.firebaseapp.com",
    projectId: "lockyourassin",
    storageBucket: "lockyourassin.firebasestorage.app",
    messagingSenderId: "689115328263",
    appId: "1:689115328263:web:31c382acad81c60a639fa2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Cloud Messaging (FCM)
let messaging = null;
try {
    messaging = getMessaging(app);
} catch (err) {
    console.warn('FCM not supported in this browser:', err.message);
}

// Export everything needed
export {
    app, auth, db, messaging,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    onAuthStateChanged,
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
    query, where, orderBy, serverTimestamp, Timestamp,
    setDoc, getDoc,
    getToken, onMessage
};
