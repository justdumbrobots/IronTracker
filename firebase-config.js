// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);
