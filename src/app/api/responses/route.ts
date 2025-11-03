import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db, auth } from "../../firebaseAdmin";
import admin from "firebase-admin";
import { calculateOpenAICost } from "../../utils/cost";

interface UserData {
  groupId?: string;
  [key: string]: any;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const idToken = authHeader.split(" ")[1];
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userData = userDoc.data() as UserData | undefined;
    if (!userData?.groupId) return NextResponse.json({ error: "User not in group" }, { status: 403 });

    const groupRef = db.collection("groups").doc(userData.groupId);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const finalResponse = await db.runTransaction(async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) throw new Error("Group not found");

      const groupData = groupSnap.data() || {};
      const currentCredits = groupData.credits ?? 0;

      const response: any = await openai.responses.create({ ...body, stream: false });
      const usage = response.usage || { input_tokens: 0, output_tokens: 0 };

      let audioSeconds = usage.audio_seconds ?? 0;
      if (audioSeconds === 0 && response.output) {
        for (const item of response.output) {
          if (item.content?.length) {
            for (const part of item.content) {
              if (
                part.type === "audio" &&
                typeof part.audio_start_ms === "number" &&
                typeof part.audio_end_ms === "number"
              ) {
                audioSeconds += (part.audio_end_ms - part.audio_start_ms) / 1000;
              }
            }
          }
        }
      }

      const cost = calculateOpenAICost(
        body.model ?? "unknown",
        usage.input_tokens,
        usage.output_tokens,
        audioSeconds
      );

      const activityRef = groupRef.collection("activity").doc();
      tx.set(activityRef, {
        userId: uid,
        userEmail: decoded.email ?? "",
        model: body.model ?? "unknown",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        audioSeconds,
        cost,
        success: currentCredits >= cost,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (currentCredits < cost) throw new Error("Insufficient credits");

      tx.update(groupRef, { credits: currentCredits - cost });

      return response;
    });

    return NextResponse.json(finalResponse);

  } catch (err: any) {
    console.error("OpenAI proxy error:", err);
    const status = err.message.includes("Insufficient credits") ? 402 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}


async function structuredResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.parse({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('responses proxy error', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

async function textResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.create({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('responses proxy error', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
