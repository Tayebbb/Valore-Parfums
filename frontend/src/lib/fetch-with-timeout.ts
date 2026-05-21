/**
 * Fetch wrapper with timeout, retry, and AbortController support for mobile stability
 */

export interface FetchOptions extends RequestInit {
  timeout?: number; // ms, default 10s
  retries?: number; // default 1 (no retry)
  retryDelay?: number; // ms, default 500
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds - mobile-friendly
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY = 500;

export class TimeoutError extends Error {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Fetch with timeout support - cancels request if it takes too long
 * Useful for mobile networks where requests can hang indefinitely
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    signal,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= retries) {
    try {
      // Create abort controller if not provided
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: signal || controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error));

      // If it's a timeout error (AbortError), retry if attempts remain
      const isTimeout =
        lastError.name === "AbortError" ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("aborted");

      if (isTimeout && attempt < retries) {
        attempt++;
        // Wait before retrying with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * attempt)
        );
        continue;
      }

      // Don't retry on other errors
      if (isTimeout && attempt === retries) {
        throw new TimeoutError(
          `Request timeout after ${timeout}ms (attempt ${attempt + 1})`
        );
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Unknown fetch error");
}

/**
 * Higher-level fetch wrapper that handles common patterns:
 * - Automatic timeout
 * - Retry on network errors
 * - JSON parsing with error handling
 */
export async function apiFetch<T = unknown>(
  url: string | URL,
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    timeout: 10000,
    retries: 1,
    ...options,
  });

  if (!response.ok) {
    const error = new Error(`API error: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Failed to parse API response as JSON");
  }
}
