import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq3LRPvBDn1ZH6UDMPGDH_-LC7JnsEhLg",
  authDomain: "newworld-1a1d5.firebaseapp.com",
  projectId: "newworld-1a1d5",
  storageBucket: "newworld-1a1d5.firebasestorage.app",
  messagingSenderId: "948363397391",
  appId: "1:948363397391:web:5d7dee7a383f3bdec0167a",
  measurementId: "G-JELWYJSLWY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
