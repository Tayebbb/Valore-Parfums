// ─── Rate Limiting Utilities ───────────────────────
// Provides per-endpoint and per-user rate limiting

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (use Redis in production for distributed rate limiting)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// Get client IP address from request
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Create rate limit key
function makeKey(prefix: string, identifier: string): string {
  return `${prefix}:${identifier}`;
}

// Check if request should be rate limited
export function checkRateLimit(
  prefix: string,
  identifier: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfter?: number } {
  const key = makeKey(prefix, identifier);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    // First request in window
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.resetAt < now) {
    // Window expired, reset
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  // Still in window
  if (entry.count >= config.maxRequests) {
    // Rate limited
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // Increment counter
  entry.count++;
  return { allowed: true };
}

// ─── Standard Rate Limit Configurations ────────────
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
};

export const UPLOAD_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 uploads per minute
};
