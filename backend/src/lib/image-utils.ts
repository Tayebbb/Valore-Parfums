export function parseImageList(imagesRaw: string | undefined): string[] {
  if (!imagesRaw) return [];

  try {
    const parsed = JSON.parse(imagesRaw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export function isCloudinaryUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https:\/\/res\.cloudinary\.com\//i.test(trimmed);
}

export function sanitizeCloudinaryUrl(value: unknown): string {
  if (!isCloudinaryUrl(value)) return "";
  return String(value).trim();
}

export function sanitizeCloudinaryImagesField(imagesRaw: unknown): { imageList: string[]; images: string; mainImage: string } {
  let parsed: unknown = [];
  if (Array.isArray(imagesRaw)) {
    parsed = imagesRaw;
  } else if (typeof imagesRaw === "string") {
    try {
      parsed = JSON.parse(imagesRaw);
    } catch {
      parsed = [];
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => isCloudinaryUrl(item))
    : [];

  return {
    imageList: list,
    images: JSON.stringify(list),
    mainImage: list[0] || "",
  };
}
