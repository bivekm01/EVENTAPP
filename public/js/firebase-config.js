import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyATX9OgW9Swx_QmcsYtfgkml2vvOh5UA3Y",
  authDomain: "eventapp-6c1b5.firebaseapp.com",
  projectId: "eventapp-6c1b5",
  storageBucket: "eventapp-6c1b5.firebasestorage.app",
  messagingSenderId: "451052585948",
  appId: "1:451052585948:web:5233302a6e8ebb23db0519",
  measurementId: "G-LE136ZMZVS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export auth and db so app.js can use them
export const auth = getAuth(app);
export const db = getFirestore(app);