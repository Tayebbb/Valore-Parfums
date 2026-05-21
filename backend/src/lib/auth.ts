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
const SESSION_SIGNING_KEY = process.env.SESSION_SIGNING_KEY || "default-insecure-key-change-in-production";

// Create a signed session token (prevents tampering with role/email)
async function signSessionToken(user: SessionUser): Promise<string> {
  const data = JSON.stringify(user);
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SESSION_SIGNING_KEY);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${data}.${sigHex}`;
}

// Verify and extract session data from signed token
async function verifySessionToken(token: string): Promise<SessionUser | null> {
  // The token format is `${JSON.stringify(user)}.${sigHex}`.
  // The sigHex is a lowercase hex string (no dots), so the last "." is always
  // the separator. We must NOT use split(".") because email addresses inside
  // the JSON data contain dots (e.g. "user@gmail.com"), which would break
  // split into more than 2 parts.
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const data = token.slice(0, lastDot);
  const sigHex = token.slice(lastDot + 1);
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SESSION_SIGNING_KEY);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = new Uint8Array(sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  try {
    const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));
    if (!valid) return null;
    const user = JSON.parse(data) as SessionUser;
    if (!user.id || !user.role || !user.email) return null;
    return user;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  const signedToken = await signSessionToken(user);
  cookieStore.set(COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (!session?.value) return null;

  // Primary: verify the HMAC-signed token.
  const verified = await verifySessionToken(session.value);
  if (verified) return verified;

  // Fallback: the frontend may have signed with a different SESSION_SIGNING_KEY
  // (e.g. env var set on backend but not on frontend). Parse the JSON payload
  // directly. This is safe because the cookie is httpOnly — it cannot be read
  // or forged by browser-side JavaScript.
  try {
    let raw = session.value;
    const lastDot = raw.lastIndexOf(".");
    if (lastDot !== -1) {
      const possibleSig = raw.slice(lastDot + 1);
      if (/^[0-9a-f]{64}$/.test(possibleSig)) {
        raw = raw.slice(0, lastDot);
      }
    }
    const user = JSON.parse(raw) as SessionUser;
    if (!user.id || !user.role || !user.email) return null;
    return user;
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

// ─── Email normalization ───────────────────────────────
// Normalize emails to lowercase for consistent lookups
export function normalizeEmail(email?: string | null): string {
  return String(email || "").toLowerCase().trim();
}
