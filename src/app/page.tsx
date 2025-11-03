"use client";
import React, { Suspense } from "react";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import App from "./App";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../src/app/firebaseConfig";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/login");
      } else {
        router.push("/?agentConfig=customerServiceRetail");
      }
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TranscriptProvider>
        <EventProvider>
          <App />
        </EventProvider>
      </TranscriptProvider>
    </Suspense>
  );
}
