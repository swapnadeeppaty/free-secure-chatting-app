"use client";

import { useEffect } from "react";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = auth.currentUser;

    if (user) {
      router.push("/chat");
    } else {
      router.push("/login");
    }
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <p>Loading...</p>
    </div>
  );
}