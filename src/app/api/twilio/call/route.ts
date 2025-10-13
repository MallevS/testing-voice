import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  const { to } = await req.json();
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

  const call = await client.calls.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER!,
    url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/voice`,
    statusCallback: `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio/status`,
    statusCallbackEvent: ["initiated", "ringing", "in-progress", "completed", "failed"],
  });

  return NextResponse.json({ success: true, callSid: call.sid });
}
