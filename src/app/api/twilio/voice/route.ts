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
  const { searchParams } = new URL(req.url);
  const companyName = searchParams.get("companyName") || "the company";
  const companyContext = searchParams.get("companyContext") || "a helpful business";

  // 🔥 Pass context to WebSocket via URL parameters
  const wsUrl = new URL("wss://voice-realtime-bridge.fly.dev");
  wsUrl.searchParams.set("companyName", companyName);
  wsUrl.searchParams.set("companyContext", companyContext);

  const twiml = `
    <Response>
      <Connect>
        <Stream url="${wsUrl.toString()}" />
      </Connect>
    </Response>
  `;
  
  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}