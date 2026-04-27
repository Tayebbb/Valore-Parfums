import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { verifyPassword, hashPassword, setSessionCookie, normalizeEmail } from "@/lib/auth";
import { checkRateLimit, AUTH_RATE_LIMIT, getClientIp } from "@/lib/rate-limit";

// POST /api/auth/login
export async function POST(req: Request) {
  // Apply rate limiting per IP address
  const clientIp = getClientIp(req);
  const rateLimitCheck = checkRateLimit("auth-login", clientIp, AUTH_RATE_LIMIT);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitCheck.retryAfter),
        },
      },
    );
  }

  const body = await req.json();
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const snap = await db.collection(Collections.users).where("email", "==", email).limit(1).get();
  if (snap.empty) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const userDoc = snap.docs[0];
  const user = { id: userDoc.id, ...userDoc.data() } as {
    id: string;
    name: string;
    email: string;
    role: string;
    passwordHash: string;
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

