import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "@/app/firebaseConfig";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      to, 
      from, 
      companyName, 
      companyContext, 
      userId,
      customerName,    // 🔥 NEW
      customerEmail    // 🔥 NEW
    } = body;

    console.log("📞 Initiating call with:", { 
      to, 
      companyName, 
      companyContext,
      customerName,
      customerEmail 
    });

    if (!to) {
      return NextResponse.json({ error: "Missing 'to' number" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const defaultFrom = process.env.TWILIO_PHONE_NUMBER!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

    if (!accountSid || !authToken || !defaultFrom || !baseUrl) {
      console.error("❌ Missing required environment variables");
      return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);

    // 🔥 Create Firebase call document with customer data
    let callDocId: string | null = null;
    try {
      const callsRef = collection(db, "calls");
      const callDoc = await addDoc(callsRef, {
        phoneNumber: to,
        companyName: companyName || "Unknown",
        companyContext: companyContext || "",
        customerName: customerName || null,        // 🔥 SAVE CUSTOMER NAME
        customerEmail: customerEmail || null,      // 🔥 SAVE CUSTOMER EMAIL
        userId: userId || null,
        status: "initiating",
        callSid: null,
        timestamp: serverTimestamp(),
      });
      callDocId = callDoc.id;
      console.log("✅ Created call document:", callDocId);
    } catch (err) {
      console.error("⚠️ Failed to create Firebase doc (non-critical):", err);
    }

    // 🔥 Pass ALL context via URL (including customer data)
    const contextData = {
      companyName: companyName || "the company",
      companyContext: companyContext || "a helpful business",
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      callDocId: callDocId
    };

    console.log("🔥 Context data BEFORE encoding:", contextData);

    const base64Context = Buffer.from(JSON.stringify(contextData)).toString('base64');
    console.log("🔥 Base64 context:", base64Context);

    const verifyDecode = JSON.parse(Buffer.from(base64Context, 'base64').toString('utf-8'));
    console.log("✅ Verification decode:", verifyDecode);

    const wsUrl = `wss://voice-realtime-bridge.fly.dev/${base64Context}`;

    console.log("🔗 WebSocket URL with context:", wsUrl);

    const voiceUrl = `${baseUrl}/api/twilio/voice?context=${base64Context}`;

    const call = await client.calls.create({
      to,
      from: from || defaultFrom,
      url: voiceUrl,
      statusCallback: `${baseUrl}/api/twilio/webhook`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed", "busy", "no-answer", "failed"],
      statusCallbackMethod: "POST",
    });

    console.log("✅ Call created successfully:", call.sid);

    // Update Firebase with Twilio callSid
    if (callDocId) {
      try {
        await updateDoc(doc(db, "calls", callDocId), {
          callSid: call.sid,
          status: "ringing",
        });
        console.log("✅ Updated Firebase with callSid");
      } catch (err) {
        console.error("⚠️ Failed to update Firebase (non-critical):", err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      callSid: call.sid,
      callDocId: callDocId ,
      contextSent: contextData
    });
  } catch (error: any) {
    console.error("❌ Error creating call:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}