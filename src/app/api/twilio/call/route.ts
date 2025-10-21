// import { NextResponse } from "next/server";
// import twilio from "twilio";

// export async function POST(req: Request) {
//   try {
//     const body = await req.json();
//     const { to, from } = body;

//     // Validate input
//     if (!to) {
//       return NextResponse.json({ error: "Missing 'to' number" }, { status: 400 });
//     }

//     // Env vars
//     const accountSid = process.env.TWILIO_ACCOUNT_SID!;
//     const authToken = process.env.TWILIO_AUTH_TOKEN!;
//     const defaultFrom = process.env.TWILIO_PHONE_NUMBER!;
//     const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

//     if (!accountSid || !authToken || !defaultFrom || !baseUrl) {
//       console.error("❌ Missing required environment variables");
//       return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
//     }

//     const client = twilio(accountSid, authToken);

//     console.log("📞 Initiating Twilio call", { to, from: from || defaultFrom });

//     const call = await client.calls.create({
//       to,
//       from: from || defaultFrom, // ✅ fallback to env var
//       url: `${baseUrl}/api/twilio/voice`,
//       statusCallback: `${baseUrl}/api/twilio/status`,
//       statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
//     });

//     console.log("✅ Call created successfully:", call.sid);
//     return NextResponse.json({ success: true, callSid: call.sid });
//   } catch (error: any) {
//     console.error("❌ Error creating call:", error.message);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, from, companyName, companyContext } = body;

    console.log("📞 Initiating call with:", { to, companyName, companyContext });

    // Validate input
    if (!to) {
      return NextResponse.json({ error: "Missing 'to' number" }, { status: 400 });
    }

    // Env vars
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const defaultFrom = process.env.TWILIO_PHONE_NUMBER!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

    if (!accountSid || !authToken || !defaultFrom || !baseUrl) {
      console.error("❌ Missing required environment variables");
      return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);

    // 🔥 Pass company context as URL parameters
    const voiceUrl = new URL(`${baseUrl}/api/twilio/voice`);
    if (companyName) voiceUrl.searchParams.set("companyName", companyName);
    if (companyContext) voiceUrl.searchParams.set("companyContext", companyContext);

    console.log("🔗 Voice URL:", voiceUrl.toString());

    const call = await client.calls.create({
      to,
      from: from || defaultFrom,
      url: voiceUrl.toString(),
      statusCallback: `${baseUrl}/api/twilio/status`,
      // 🔥 FIX: Use correct event names (no spaces, use hyphens)
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    console.log("✅ Call created successfully:", call.sid);
    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (error: any) {
    console.error("❌ Error creating call:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}