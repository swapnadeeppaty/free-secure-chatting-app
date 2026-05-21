"use client";

import {
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
} from "react";

import {
  useAuth,
} from "../context/AuthContext";

export default function LoginPage() {

  const router = useRouter();

  const { user, loading } =
    useAuth();

  // ✅ redirect if already logged in
  useEffect(() => {

    if (!loading && user) {
      router.push("/chat");
    }

  }, [user, loading]);

  const handleLogin =
    async () => {

      const provider =
        new GoogleAuthProvider();

      try {

        const result =
          await signInWithPopup(
            auth,
            provider
          );

        const user =
          result.user;

        const docRef =
          doc(
            db,
            "users",
            user.uid
          );

        const docSnap =
          await getDoc(docRef);

        if (docSnap.exists()) {
          router.push("/chat");
        } else {
          router.push("/setup");
        }

      } catch (error: any) {

        console.error(error);

        alert(error.message);
      }
    };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">

      <button
        onClick={handleLogin}
        className="bg-black text-white px-6 py-3 rounded-lg"
      >
        Sign in with Google
      </button>

    </div>
  );
}