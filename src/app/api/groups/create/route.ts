import { NextRequest, NextResponse } from "next/server";
import { db } from '../../../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { groupName, adminUids, credits } = body;
    const createdBy = req.headers.get("x-user-uid");

    if (!groupName || !adminUids || !createdBy || credits === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Create the group
    const groupRef = await addDoc(collection(db, "groups"), {
      name: groupName,
      admins: adminUids,
      users: [],
      credits,
      createdAt: serverTimestamp(),
      createdBy
    });

    // Update each admin's groupId in their user doc
    await Promise.all(
      adminUids.map(async (uid: string) => {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { groupId: groupRef.id });
      })
    );

    return NextResponse.json({ success: true, groupId: groupRef.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
