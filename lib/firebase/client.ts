// Firebase Client for Task Manager
// Using same Firebase project as registry

import { getApp, getApps, initializeApp, type FirebaseApp } from "@firebase/app";
import { getAuth, type Auth, signInWithCustomToken } from "firebase/auth";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const firebaseConfig: FirebaseClientConfig = {
  apiKey: "AIzaSyBcSa5UJs-4aHbz9eUMerXyxgiMX93ly6g",
  authDomain: "bclauth-bd469.firebaseapp.com",
  projectId: "bclauth-bd469",
  storageBucket: "bclauth-bd469.firebasestorage.app",
  messagingSenderId: "798908776993",
  appId: "1:798908776993:web:0be9aa02f240632e149960",
  measurementId: "G-K996PJ9VMQ",
};

const missingPublicConfig = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

if (missingPublicConfig.length === 0) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
} else if (process.env.NODE_ENV !== "production") {
  console.warn("Firebase client configuration is incomplete.");
}

export function isFirebaseClientReady() {
  return firebaseAuth !== null;
}

export function getFirebaseAuthClient() {
  return firebaseAuth;
}

export function initializeFirebaseAuth() {
  // Firebase is already initialized above
}

// Initialize on client side
if (typeof window !== 'undefined') {
  initializeFirebaseAuth();
}
