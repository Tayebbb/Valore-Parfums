import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, Collections } from "@/lib/prisma";
import { setSessionCookie, normalizeEmail } from "@/lib/auth";

// Firebase ID tokens are standard RS256 JWTs signed by Google's secure-token
// service. Verified with jose because firebase-admin/auth fails to load inside
// the Vercel function bundle (untraced transitive deps).
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

function resolveProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ""
  );
}

interface FirebaseIdTokenPayload {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<Required<Pick<FirebaseIdTokenPayload, "sub">> & FirebaseIdTokenPayload> {
  const projectId = resolveProjectId();
  if (!projectId) {
    throw new Error("Firebase project ID is not configured on the server.");
  }
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const sub = String(payload.sub || "").trim();
  if (!sub) {
    throw new Error("Invalid Firebase ID token: missing subject.");
  }
  return { ...(payload as FirebaseIdTokenPayload), sub };
}

// POST /api/auth/google
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || "").trim();

    if (!idToken) {
      return NextResponse.json({ error: "Google ID token is required" }, { status: 400 });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    const email = normalizeEmail(decoded.email);
    if (!email) {
      return NextResponse.json({ error: "Google account email is required" }, { status: 400 });
    }

    const displayName = String(decoded.name || "").trim() || email.split("@")[0] || "Customer";
    const photoURL = String(decoded.picture || "").trim();
    const googleUid = decoded.sub;

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
