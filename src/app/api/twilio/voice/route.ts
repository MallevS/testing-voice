import { NextResponse } from "next/server";

export async function POST() {
    const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://voice-realtime-bridge.fly.dev" />
      </Connect>
    </Response>
  `;
  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}