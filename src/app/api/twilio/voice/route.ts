import { NextResponse } from "next/server";

export async function POST() {
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${process.env.NEXT_PUBLIC_BASE_URL!.replace(/^https?:\/\//,'')}/api/realtime-stream" />
      </Connect>
    </Response>
  `;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}
