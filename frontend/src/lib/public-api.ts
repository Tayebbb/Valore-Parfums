const PUBLIC_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");

export function toPublicApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!PUBLIC_API_BASE) return normalizedPath;
  return `${PUBLIC_API_BASE}${normalizedPath}`;
}
