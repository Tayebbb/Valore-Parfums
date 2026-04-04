import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";
import { db, Collections } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

// POST /api/auth/google
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || "").trim();

    if (!idToken) {
      return NextResponse.json({ error: "Google ID token is required" }, { status: 400 });
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    const email = String(decoded.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Google account email is required" }, { status: 400 });
    }

    const displayName = String(decoded.name || "").trim() || email.split("@")[0] || "Customer";
    const photoURL = String(decoded.picture || "").trim();
    const googleUid = String(decoded.uid || "").trim();

    const now = Timestamp.now();

    const userSnap = await db.collection(Collections.users).where("email", "==", email).limit(1).get();

    let userId = "";
    let role = "customer";
    let name = displayName;

    if (!userSnap.empty) {
      const existingDoc = userSnap.docs[0];
      const existing = existingDoc.data() as {
        name?: string;
        role?: string;
      };

      userId = existingDoc.id;
      role = String(existing.role || "customer");
      name = String(existing.name || displayName || "Customer");

      await db.collection(Collections.users).doc(userId).set(
        {
          name,
          email,
          googleUid,
          authProvider: "google",
          photoURL,
          updatedAt: now,
          lastLoginAt: now,
        },
        { merge: true },
      );
    } else {
      userId = uuid();
      await db.collection(Collections.users).doc(userId).set({
        name,
        email,
        phone: "",
        role,
        passwordHash: "",
        googleUid,
        authProvider: "google",
        photoURL,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      });
    }

    await setSessionCookie({ id: userId, name, email, role });

    return NextResponse.json({ id: userId, name, email, role });
  } catch (error) {
    console.error("Google auth error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google sign-in failed" },
      { status: 500 },
    );
  }
}
