// ─── Session token sign/verify (no next/headers — safe for middleware) ───
// The HMAC signature is the ONLY thing that makes the vp-session cookie
// trustworthy. httpOnly does not help: any client can send an arbitrary
// Cookie header with curl. Never parse the payload without verifying.

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const COOKIE_NAME = "vp-session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface SignedSessionPayload extends SessionUser {
  exp: number;
}

// Resolved lazily (not at module load) so that `next build` does not require
// the production secret to be present in the build environment.
function resolveSigningKey(): string {
  const key = process.env.SESSION_SIGNING_KEY;
  if (key && key.length >= 32) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SIGNING_KEY must be set to a value of at least 32 characters in production.",
    );
  }
  return key || "dev-only-insecure-key-do-not-use-in-production";
}

async function getHmacKey(usage: "sign" | "verify"): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(resolveSigningKey());
  return crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  const payload: SignedSessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  };
  const data = JSON.stringify(payload);
  const key = await getHmacKey("sign");
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${data}.${sigHex}`;
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  // Token format: `{json}.{hex-hmac}`. Emails contain dots, so split on the LAST dot.
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const data = token.slice(0, lastDot);
  const signature = hexToBytes(token.slice(lastDot + 1));
  if (!signature) return null;

  try {
    const key = await getHmacKey("verify");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as BufferSource,
      new TextEncoder().encode(data),
    );
    if (!valid) return null;

    const payload = JSON.parse(data) as Partial<SignedSessionPayload>;
    if (!payload.id || !payload.role) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;

    return {
      id: String(payload.id),
      name: String(payload.name || ""),
      email: String(payload.email || ""),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}
