import { NextResponse } from "next/server";

export async function POST() {
  const twiml = `
  <Response>
  <Connect>
    <Stream url="wss://testing-voice-amber.vercel.app/api/realtime-stream" />
  </Connect>
</Response>

  `;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}
