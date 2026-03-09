import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { hashPassword, setSessionCookie } from "@/lib/auth";

// POST /api/auth/signup
export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, phone, password } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const existingSnap = await db.collection(Collections.users).where("email", "==", email).limit(1).get();
  if (!existingSnap.empty) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const id = uuid();
  const now = Timestamp.now();
  const role = "customer";

  await db.collection(Collections.users).doc(id).set({
    name: String(name).slice(0, 100),
    email: String(email).slice(0, 254),
    phone: String(phone || "").slice(0, 20),
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  });

  await setSessionCookie({ id, name, email, role });

  return NextResponse.json({ id, name, email, role });
}
