import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const context = searchParams.get("context");

    console.log("📋 Voice route called with context:", context);

    if (!context) {
      console.error("❌ No context provided");
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, the call could not be configured properly. Please try again later.</Say>
  <Hangup/>
</Response>`;
      
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // 🔥 DECODE AND LOG the context to verify it has customer data
    let decodedContext: any = {};
    try {
      decodedContext = JSON.parse(Buffer.from(context, 'base64').toString('utf-8'));
      console.log("📦 Decoded context in voice route:", JSON.stringify(decodedContext, null, 2));
      
      // ✅ Verify customer data is present
      if (decodedContext.customerName) {
        console.log("✅ Customer name found:", decodedContext.customerName);
      } else {
        console.warn("⚠️⚠️⚠️ NO CUSTOMER NAME IN CONTEXT! ⚠️⚠️⚠️");
      }
      if (decodedContext.customerEmail) {
        console.log("✅ Customer email found:", decodedContext.customerEmail);
      } else {
        console.warn("⚠️⚠️⚠️ NO CUSTOMER EMAIL IN CONTEXT! ⚠️⚠️⚠️");
      }
      if (decodedContext.callDocId) {
        console.log("✅ Call doc ID found:", decodedContext.callDocId);
      } else {
        console.warn("⚠️ No call doc ID in context");
      }
    } catch (err) {
      console.error("⚠️ Failed to decode context:", err);
    }

    // 🔥 CRITICAL: Pass the SAME context to WebSocket (don't modify it!)
    const wsUrl = `wss://voice-realtime-bridge.fly.dev/${context}`;
    console.log("🔗 WebSocket URL:", wsUrl);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
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