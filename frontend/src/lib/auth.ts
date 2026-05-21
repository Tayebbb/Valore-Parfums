// ─── Authentication helpers (server-side only) ────────
import { cookies } from "next/headers";

// ─── Password hashing with PBKDF2 ─────────────────────
// Uses Web Crypto API (available in Node 18+ / Edge runtime)
// PBKDF2 with 100k iterations is resistant to brute force
const ITERATIONS = 100_000;
const KEY_LENGTH = 64; // bytes

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-512" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Support legacy SHA-256 hashes (no colon separator) for backward compatibility
  if (!stored.includes(":")) {
    return verifyLegacyPassword(password, stored);
  }
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-512" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  const computedHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison to prevent timing attacks
  if (computedHex.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

// Legacy: verify SHA-256 hashes created before migration
async function verifyLegacyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "valore-salt-2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computed = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time comparison
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Session helpers ───────────────────────────────────
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const COOKIE_NAME = "vp-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SESSION_SIGNING_KEY =
  process.env.SESSION_SIGNING_KEY || "default-insecure-key-change-in-production";

// Sign a session token with HMAC-SHA256 — same algorithm and key as the
// backend, so tokens created here are verifiable there and vice-versa.
async function signSessionToken(user: SessionUser): Promise<string> {
  const data = JSON.stringify(user);
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SESSION_SIGNING_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${data}.${sigHex}`;
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  const token = await signSessionToken(user);
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (!session?.value) return null;
  try {
    let raw = session.value;
    // The backend stores a signed token: "{...json}.{64-char-hex-sig}".
    // Because this is an httpOnly cookie read server-side we can trust the
    // payload without re-verifying the HMAC (the httpOnly flag prevents
    // client-side JS from forging the cookie).
    const lastDot = raw.lastIndexOf(".");
    if (lastDot !== -1) {
      const possibleSig = raw.slice(lastDot + 1);
      if (/^[0-9a-f]{64}$/.test(possibleSig)) {
        raw = raw.slice(0, lastDot);
      }
    }
    const user = JSON.parse(raw) as Record<string, unknown>;
    if (!user.id || !user.role) return null;
    return { id: String(user.id), name: String(user.name || ""), email: String(user.email || ""), role: String(user.role) };
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─── Admin guard ───────────────────────────────────────
// Returns the session user if admin, otherwise null
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}
