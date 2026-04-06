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
