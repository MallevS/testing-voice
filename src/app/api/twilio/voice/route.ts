// import { NextResponse } from "next/server";

// export async function POST() {
//     const twiml = `
//     <Response>
//       <Connect>
//         <Stream url="wss://voice-realtime-bridge.fly.dev" />
//       </Connect>
//     </Response>
//   `;
//   return new NextResponse(twiml, {
//     headers: { "Content-Type": "text/xml" },
//   });
// }
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Twilio sends form data, not JSON
    const formData = await req.formData();

    // Try to get from query params first (our custom params)
    const { searchParams } = new URL(req.url);
    let companyName = searchParams.get("companyName");
    let companyContext = searchParams.get("companyContext");

    // If not in query params, try form data (unlikely but safe)
    if (!companyName) companyName = formData.get("companyName")?.toString() || "the company";
    if (!companyContext) companyContext = formData.get("companyContext")?.toString() || "a helpful business";

    console.log("📋 Voice route called with:", { companyName, companyContext });

    // 🔥 Pass context to WebSocket via URL parameters
    const wsUrl = new URL("wss://voice-realtime-bridge.fly.dev");
    wsUrl.searchParams.set("companyName", companyName);
    wsUrl.searchParams.set("companyContext", companyContext);

    console.log("🔗 WebSocket URL:", wsUrl.toString());

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl.toString()}" />
  </Connect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("❌ Error in voice route:", error);

    // Return error TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, an application error has occurred. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(errorTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}