// // import { NextResponse } from "next/server";
// // import twilio from "twilio";

// // export async function POST(req: Request) {
// //   const { to } = await req.json();
// //   const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

// //   const call = await client.calls.create({ 
// //     to,
// //     from: process.env.TWILIO_PHONE_NUMBER!,
// //     url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/voice`,
// //     statusCallback: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/status`,
// //     statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
// //   });

// //   return NextResponse.json({ success: true, callSid: call.sid });
// // }
// // import { NextResponse } from "next/server";
// // import twilio from "twilio";

// // export async function POST(req: Request) {
// //   try {
// //     const { to } = await req.json();

// //     if (!to) {
// //       console.error("❌ Missing 'to' number in request body");
// //       return NextResponse.json({ error: "Missing 'to' phone number" }, { status: 400 });
// //     }

// //     const accountSid = process.env.TWILIO_ACCOUNT_SID;
// //     const authToken = process.env.TWILIO_AUTH_TOKEN;
// //     const from = process.env.TWILIO_PHONE_NUMBER;
// //     const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

// //     if (!accountSid || !authToken || !from || !baseUrl) {
// //       console.error("❌ Missing environment variables", { accountSid, authToken, from, baseUrl });
// //       return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
// //     }

// //     const client = twilio(accountSid, authToken);

// //     console.log("📞 Creating call:", { to, from, baseUrl });

// //     const call = await client.calls.create({
// //       to,
// //       from,
// //       url: `${baseUrl}/api/twilio/voice`,
// //       statusCallback: `${baseUrl}/api/twilio/status`,
// //       statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
// //     });

// //     console.log("✅ Call created:", call.sid);
// //     return NextResponse.json({ success: true, callSid: call.sid });
// //   } catch (error: any) {
// //     console.error("❌ Error creating Twilio call:", error);
// //     return NextResponse.json({ error: error.message }, { status: 500 });
// //   }
// // }
// import { NextResponse } from "next/server";
// import twilio from "twilio";

// export async function POST(req: Request) {
//   const { to, from } = await req.json();
//   const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

//   const call = await client.calls.create({
//     to,
//     from: from || process.env.TWILIO_PHONE_NUMBER!,
//     url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/voice`,
//     statusCallback: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/status`,
//     statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
//   });

//   return NextResponse.json({ success: true, callSid: call.sid });
// }
import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, from } = body;

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

    console.log("📞 Initiating Twilio call", { to, from: from || defaultFrom });

    const call = await client.calls.create({
      to,
      from: from || defaultFrom, // ✅ fallback to env var
      url: `${baseUrl}/api/twilio/voice`,
      statusCallback: `${baseUrl}/api/twilio/status`,
      statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
    });

    console.log("✅ Call created successfully:", call.sid);
    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (error: any) {
    console.error("❌ Error creating call:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
