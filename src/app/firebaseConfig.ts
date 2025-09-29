import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAVEp-cULhi6X8YYX8pNGzHb_BhBv9FU40",
    authDomain: "voizer-clone.firebaseapp.com",
    projectId: "voizer-clone",
    storageBucket: "voizer-clone.firebasestorage.app",
    messagingSenderId: "813307418569",
    appId: "1:813307418569:web:070dbdc1bceaeefeeeba18",
    measurementId: "G-RX5ZWTK18X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);