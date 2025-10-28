// webhook/route.ts - CRITICAL FIXES

import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { calculateTwilioCost } from "@/app/utils/cost";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;

    console.log("📞 Twilio Webhook Received:", { callSid, callStatus, callDuration, from, to });

    // 🔥 CRITICAL: Map Twilio status to app status
    const statusMap: Record<string, string> = {
      'queued': 'pending',
      'initiated': 'calling',      // NEW
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'answered': 'in-progress',   // NEW - treat answered as in-progress
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'failed'
    };

    const mappedStatus = statusMap[callStatus.toLowerCase()] || callStatus;

    console.log(`🔄 Mapping Twilio status "${callStatus}" → "${mappedStatus}"`);

    // 🔥 FIX 1: Find and update call document
    const callsSnapshot = await db.collection("calls")
      .where("callSid", "==", callSid)
      .limit(1)
      .get();

    if (!callsSnapshot.empty) {
      const callDoc = callsSnapshot.docs[0];
      const callData = callDoc.data();

      // Update call document
      await callDoc.ref.update({
        status: mappedStatus,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Updated call document to status: ${mappedStatus}`);

      // 🔥 FIX 2: Update callList entry in real-time
      if (callData.userId) {
        const userDoc = await db.collection("users").doc(callData.userId).get();
        const userData = userDoc.data();
        
        if (userData?.groupId) {
          const callListSnapshot = await db.collection("groups")
            .doc(userData.groupId)
            .collection("callList")
            .where("callSid", "==", callSid)
            .limit(1)
            .get();

          if (!callListSnapshot.empty) {
            const updateData: any = {
              status: mappedStatus,
              lastCallTimestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            await callListSnapshot.docs[0].ref.update(updateData);
            console.log(`✅ Updated callList status to: ${mappedStatus}`);
          } else {
            console.warn(`⚠️ No callList entry found for callSid: ${callSid}`);
          }
        }
      }

      // 🔥 FIX 3: Only bill on completed calls
      if (callStatus.toLowerCase() === "completed" && callDuration) {
        const durationSeconds = parseInt(callDuration, 10);
        const cost = calculateTwilioCost(durationSeconds);

        console.log(`💰 Call completed - Duration: ${durationSeconds}s, Cost: $${cost.toFixed(4)}`);

        await callDoc.ref.update({
          duration: durationSeconds,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Deduct credits and log activity
        if (callData.userId) {
          const userDoc = await db.collection("users").doc(callData.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData?.groupId) {
              const groupRef = db.collection("groups").doc(userData.groupId);

              await db.runTransaction(async (tx) => {
                const groupSnap = await tx.get(groupRef);
                if (!groupSnap.exists) return;

                const groupData = groupSnap.data() || {};
                const currentCredits = groupData.credits ?? 0;

                // Log activity
                const activityRef = groupRef.collection("activity").doc();
                tx.set(activityRef, {
                  userId: callData.userId,
                  userName: userData.name || userData.email,
                  userEmail: userData.email,
                  model: "twilio-call",
                  action: "Outbound call",
                  phoneNumber: to,
                  customerName: callData.customerName || null,
                  customerEmail: callData.customerEmail || null,
                  duration: durationSeconds,
                  cost: cost,
                  audioSeconds: durationSeconds,
                  callSid: callSid,
                  timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Deduct credits
                const newCredits = Math.max(0, currentCredits - cost);
                tx.update(groupRef, { credits: newCredits });

                console.log(`✅ Logged activity and deducted $${cost.toFixed(4)}`);
              });
            }
          }
        }
      }
    } else {
      console.warn(`⚠️ No call document found for SID: ${callSid}`);
    }

    return NextResponse.json({ success: true, status: mappedStatus });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}