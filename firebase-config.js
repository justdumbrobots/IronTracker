// Import Firebase from CDN (not npm)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// TODO: Replace these placeholder values with your actual Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyB78UVReJzB467VOIZNukbOoMm1t-TSVBc",
    authDomain: "iron-tracker-3f59f.firebaseapp.com",
    projectId: "iron-tracker-3f59f",
    storageBucket: "iron-tracker-3f59f.firebasestorage.app",
    messagingSenderId: "990770977639",
    appId: "1:990770977639:web:934961d8b5abac53b02dc2",
  measurementId: "G-K6Z38M3ZBT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log('✅ Firebase initialized');
