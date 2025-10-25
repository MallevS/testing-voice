// // app/api/twilio/webhook/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/app/firebaseConfig";
// import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";

// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();

//     const callSid = formData.get("CallSid") as string;
//     const callStatus = formData.get("CallStatus") as string;
//     const from = formData.get("From") as string;
//     const to = formData.get("To") as string;

//     // Speech-to-text results (if enabled)
//     const speechResult = formData.get("SpeechResult") as string | null;
//     const transcriptionText = formData.get("TranscriptionText") as string | null;

//     console.log("📞 Twilio Webhook:", { callSid, callStatus, from, to });

//     // Find the call in Firebase by callSid
//     // You'll need to query your callList to find which document has this callSid
//     // Then update its status

//     // For now, just log the webhook data
//     console.log("Webhook data:", {
//       callSid,
//       callStatus,
//       from,
//       to,
//       speechResult,
//       transcriptionText
//     });

//     return NextResponse.json({ success: true });
//   } catch (error) {
//     console.error("Webhook error:", error);
//     return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
//   }
// }
// app/api/twilio/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { calculateTwilioCost } from "@/app/utils/cost";

// Initialize Firebase Admin (if not already done)
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

    console.log("📞 Twilio Webhook:", { callSid, callStatus, callDuration, from, to });

    // Only process completed calls
    if (callStatus === "completed" && callDuration) {
      const durationSeconds = parseInt(callDuration, 10);
      const cost = calculateTwilioCost(durationSeconds);

      console.log(`💰 Call cost: $${cost.toFixed(4)} (${durationSeconds}s)`);

      // Find the call document by callSid
      const callsSnapshot = await db.collection("calls")
        .where("callSid", "==", callSid)
        .limit(1)
        .get();

      if (!callsSnapshot.empty) {
        const callDoc = callsSnapshot.docs[0];
        const callData = callDoc.data();

        // Update call document with duration and status
        await callDoc.ref.update({
          status: "completed",
          duration: durationSeconds,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Log activity to group if user has groupId
        if (callData.userId) {
          const userDoc = await db.collection("users").doc(callData.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData?.groupId) {
              const groupRef = db.collection("groups").doc(userData.groupId);

              // Run transaction to deduct credits and log activity
              await db.runTransaction(async (tx) => {
                const groupSnap = await tx.get(groupRef);
                if (!groupSnap.exists) {
                  console.error("Group not found");
                  return;
                }

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
                  duration: durationSeconds,
                  cost: cost,
                  audioSeconds: durationSeconds, // For dashboard display
                  callSid: callSid,
                  timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Deduct credits
                const newCredits = Math.max(0, currentCredits - cost);
                tx.update(groupRef, { credits: newCredits });

                console.log(`✅ Logged call activity and deducted $${cost.toFixed(4)} from group`);
              });
            }
          }
        }
      } else {
        console.warn(`⚠️ No call document found for SID: ${callSid}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}