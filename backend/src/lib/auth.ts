// ─── Authentication helpers (server-side only) ────────
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  signSessionToken,
  verifySessionToken,
  type SessionUser,
} from "./session-token";

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
  // Google-only accounts have an empty passwordHash and must never match.
  if (!stored || typeof stored !== "string") return false;
  // Support legacy SHA-256 hashes (no colon separator) for backward compatibility
  if (!stored.includes(":")) {
    return verifyLegacyPassword(password, stored);
  }
  const [saltHex, hashHex] = stored.split(":");
  const saltBytes = saltHex.match(/.{2}/g);
  if (!saltBytes || !hashHex) return false;
  const salt = new Uint8Array(saltBytes.map((h) => parseInt(h, 16)));
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
export type { SessionUser };
export { verifySessionToken, signSessionToken };

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  const signedToken = await signSessionToken(user);
  cookieStore.set(COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (!session?.value) return null;

  // The HMAC signature is the ONLY thing that makes this cookie trustworthy.
  // httpOnly does not help here: any client can send an arbitrary Cookie header.
  return verifySessionToken(session.value);
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
