// import { NextResponse } from "next/server";

// export async function POST(req: Request) {
//   const data = await req.formData();
//   console.log("📞 Twilio Status Webhook:", Object.fromEntries(data.entries()));

//   return NextResponse.json({ received: true }); 
// }
import { NextResponse } from "next/server";
import twilio from "twilio";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const callSid = searchParams.get("callSid");

    if (!callSid) {
      return NextResponse.json({ error: "Missing callSid" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;

    const client = twilio(accountSid, authToken);
    const call = await client.calls(callSid).fetch();

    return NextResponse.json({ 
      status: call.status,
      duration: call.duration,
      direction: call.direction
    });
  } catch (error: any) {
    console.error("❌ Error fetching call status:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}