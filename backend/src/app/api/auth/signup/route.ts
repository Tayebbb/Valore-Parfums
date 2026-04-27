import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { hashPassword, setSessionCookie, normalizeEmail } from "@/lib/auth";
import { checkRateLimit, AUTH_RATE_LIMIT, getClientIp } from "@/lib/rate-limit";
import { validateString, validateEmail } from "@/lib/validation";

// POST /api/auth/signup
export async function POST(req: Request) {
  // Apply rate limiting per IP address
  const clientIp = getClientIp(req);
  const rateLimitCheck = checkRateLimit("auth-signup", clientIp, AUTH_RATE_LIMIT);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitCheck.retryAfter),
        },
      },
    );
  }

  const body = await req.json();
  const name = String(body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const phone = String(body?.phone || "").trim();
  const password = String(body?.password || "");

  // Validate inputs
  const nameValidation = validateString(name, "name", { required: true, minLength: 2, maxLength: 100 });
  if (!nameValidation.valid) {
    return NextResponse.json({ error: nameValidation.errors[0]?.message || "Invalid name" }, { status: 400 });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    return NextResponse.json({ error: emailValidation.errors[0]?.message || "Invalid email" }, { status: 400 });
  }

  if (!password || password.length < 6 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 6 and 128 characters" },
      { status: 400 },
    );
  }

  // Check if account already exists
  const existingSnap = await db.collection(Collections.users).where("email", "==", email).limit(1).get();
  if (!existingSnap.empty) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const id = uuid();
  const now = Timestamp.now();
  const role = "customer";

  await db.collection(Collections.users).doc(id).set({
    name: name.slice(0, 100),
    email,
    phone: phone.slice(0, 20),
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  });

  await setSessionCookie({ id, name, email, role });

  return NextResponse.json({ id, name, email, role });
}

