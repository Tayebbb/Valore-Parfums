import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";

// POST /api/auth/login
export async function POST(req: Request) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const snap = await db.collection(Collections.users).where("email", "==", email).limit(1).get();
  if (snap.empty) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const userDoc = snap.docs[0];
  const user = { id: userDoc.id, ...userDoc.data() } as {
    id: string; name: string; email: string; role: string; passwordHash: string;
  };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Upgrade legacy SHA-256 hash to PBKDF2 on successful login
  if (!user.passwordHash.includes(":")) {
    const upgraded = await hashPassword(password);
    await db.collection(Collections.users).doc(user.id).update({ passwordHash: upgraded });
  }

  await setSessionCookie({ id: user.id, name: user.name, email: user.email, role: user.role });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}
