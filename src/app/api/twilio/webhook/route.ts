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

    const statusMap: Record<string, string> = {
      'queued': 'pending',
      'initiated': 'calling',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'answered': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'failed'
    };

    const mappedStatus = statusMap[callStatus.toLowerCase()] || callStatus;

    console.log(`🔄 Mapping Twilio status "${callStatus}" → "${mappedStatus}"`);

    // 🔥 FIX: Find call document
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

      // 🔥 CRITICAL FIX: Use callListDocId directly if available
      if (callData.userId && callData.callListDocId) {
        const userDoc = await db.collection("users").doc(callData.userId).get();
        const userData = userDoc.data();

        if (userData?.groupId) {
          // 🔥 DIRECT UPDATE using the callListDocId we saved
          const callListRef = db.collection("groups")
            .doc(userData.groupId)
            .collection("callList")
            .doc(callData.callListDocId);

          const updateData: any = {
            status: mappedStatus,
            lastCallTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          };

          console.log(`🔥 UPDATING CALLLIST DOCUMENT DIRECTLY:`, {
            groupId: userData.groupId,
            docId: callData.callListDocId,
            callSid: callSid,
            newStatus: mappedStatus
          });

          try {
            await callListRef.update(updateData);
            console.log(`✅ Updated callList status to: ${mappedStatus}`);
          } catch (err) {
            console.error(`❌ Failed to update callList doc ${callData.callListDocId}:`, err);
            
            // 🔥 FALLBACK: Try to find by callSid
            console.log(`⚠️ Falling back to callSid search...`);
            const callListSnapshot = await db.collection("groups")
              .doc(userData.groupId)
              .collection("callList")
              .where("callSid", "==", callSid)
              .limit(1)
              .get();

            if (!callListSnapshot.empty) {
              await callListSnapshot.docs[0].ref.update(updateData);
              console.log(`✅ Updated callList via fallback`);
            }
          }
        }
      } else {
        console.warn(`⚠️ No callListDocId found in call data for SID: ${callSid}`);
      }

      // 🔥 Only bill on completed calls
      if (callStatus.toLowerCase() === "completed" && callDuration) {
        const durationSeconds = parseInt(callDuration, 10);
        const cost = calculateTwilioCost(durationSeconds);

        console.log(`💰 Call completed - Duration: ${durationSeconds}s, Cost: $${cost.toFixed(4)}`);

        await callDoc.ref.update({
          duration: durationSeconds,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

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