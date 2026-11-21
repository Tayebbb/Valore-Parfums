export function resolveBackendBaseUrl(): string | null {
  const raw = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}
