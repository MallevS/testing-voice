"use client";

import { useState } from "react";
import { HiOutlineMail, HiOutlineLockClosed } from "react-icons/hi";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const provider = new GoogleAuthProvider();

  const handleEmailLogin = async () => {
    console.log("Attempting login with:", { email, password });
  
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Login success:", userCredential.user);
      await handlePostLogin(userCredential.user.uid);
    } catch (err: any) {
      console.error("Firebase login error object:", err);
      if (err.code) {
        console.error("Firebase error code:", err.code);
      }
      alert("Login failed: " + err.message);
    }
  };
  

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName,
          role: "user",
          createdAt: new Date(),
        });
      }

      await handlePostLogin(user.uid);
    } catch (err: any) {
      alert("Google login failed: " + err.message);
    }
  };

  const handlePostLogin = async (uid: string) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return alert("User not found in DB");

    const role = userDoc.data()?.role;
    if (role === "superadmin") {
      router.push("/dashboard/superadmin");
    } else if (role === "admin") {
      router.push("/dashboard/admin");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-3xl font-extrabold mb-6 text-gray-800">Login</h1>
        <div className="relative w-full mb-4">
          <span className="absolute left-3 top-3.5 text-gray-400">
            <HiOutlineMail size={20} />
          </span>
          <input
            type="email"
            placeholder="Email"
            className="text-black pl-10 border border-gray-300 rounded-md px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="relative w-full mb-4">
          <span className="absolute left-3 top-3.5 text-gray-400">
            <HiOutlineLockClosed size={20} />
          </span>
          <input
            type="password"
            placeholder="Password"
            className="text-black pl-10 border border-gray-300 rounded-md px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          className="bg-blue-600 hover:bg-blue-700 transition-colors duration-200 text-white font-semibold px-4 py-3 rounded-md w-full mb-5"
          onClick={handleEmailLogin}
        >
          Login with Email
        </button>

        <div className="text-gray-400 my-4 text-center">or</div>

        <button
          className="flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors duration-200 text-white font-semibold px-4 py-3 rounded-md w-full"
          onClick={handleGoogleLogin}
        >
          <span className="rounded-full p-1 mr-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-6 w-6">
              <path fill="white" d="M24 9.5c3.54 0 6.82 1.23 9.33 3.41l7-7C36.44 2.26 30.57 0 24 0 14.83 0 6.82 5.62 2.73 13.66l8.38 6.51C13.08 13.37 18.17 9.5 24 9.5z" />
              <path fill="white" d="M46.4 24.56c0-1.46-.13-2.86-.37-4.22H24v8.31h12.65c-.54 3-2.23 5.53-4.6 7.22l7.37 5.73C43.3 39.17 46.4 32.59 46.4 24.56z" />
              <path fill="white" d="M11.11 28.18c-1.02-2.94-1.02-6.07 0-9.02l-8.38-6.51C-1.14 16.68-.97 23.22 2.73 29.01l8.38-6.51z" />
              <path fill="white" d="M24 46c6.57 0 12.21-2.18 16.37-5.95l-7.37-5.73c-2.1 1.41-4.78 2.22-9 2.22-5.83 0-10.91-3.87-13.48-9.35l-8.38 6.51C6.82 42.38 14.83 46 24 46z" />
            </svg>
          </span>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
