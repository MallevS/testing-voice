import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const data = await req.formData();
  console.log("📞 Twilio Status Webhook:", Object.fromEntries(data.entries()));

  return NextResponse.json({ received: true }); 
}
