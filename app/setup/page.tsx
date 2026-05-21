"use client";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const [username, setUsername] = useState("");
  const { user, loading } = useAuth();
  useEffect(() => {

  if (!loading && !user) {
    window.location.href = "/login";
  }

  }, [user, loading]);
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  const handleSave = async () => {
    const user = auth.currentUser;

    if (!user) return alert("Not logged in");

    // 🔴 VALIDATION
    if (!username.trim()) {
      return alert("Username cannot be empty");
    }

    if (username.length < 3) {
      return alert("Username must be at least 3 characters");
    }

    try {
      setSaving(true);

      const usernameLower = username.toLowerCase();

      // 🔍 CHECK IF USERNAME EXISTS
      const q = query(
        collection(db, "users"),
        where("username", "==", usernameLower)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setSaving(false);
        return alert("Username already taken");
      }

      // ✅ SAVE USER
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        username: usernameLower,
        email: user.email,
        createdAt: new Date(),
      });

      alert("Username saved!");

      // 🚀 REDIRECT
      router.push("/chat");

    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Enter username"
          className="border p-2 rounded"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-black text-white px-4 py-2 rounded"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}