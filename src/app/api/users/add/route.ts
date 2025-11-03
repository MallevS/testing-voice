import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY!)),
  });
}

const auth = admin.auth();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name, groupId, password } = body;
  const adminUid = req.headers.get("x-user-uid");

  if (!email || !name || !groupId || !adminUid) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password: password || Math.random().toString(36).slice(-8),
      displayName: name,
    });

    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "user",
      groupId,
      createdBy: adminUid,
      createdAt: new Date(),
    });

    await db.collection("groups").doc(groupId).update({
      users: FieldValue.arrayUnion(userRecord.uid),
    });

    return NextResponse.json({ uid: userRecord.uid, password: password });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
