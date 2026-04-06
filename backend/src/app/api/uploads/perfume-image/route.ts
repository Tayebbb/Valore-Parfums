import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_SIZE_MB = 10;
const ACCEPTED_PNG_MIME_TYPES = new Set(["image/png", "image/x-png"]);
const CANVAS_SIZE = 1200;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hasPngSignature(buffer: Buffer): boolean {
  if (buffer.length < PNG_SIGNATURE.length) return false;
  return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

const MAX_RAW_DIMENSION = 2000; // cap before BFS to bound memory usage (~2000×2000×4 ≈ 16 MB)

async function removeNearWhiteBackground(buffer: Buffer): Promise<Buffer> {
  // Resize down to at most MAX_RAW_DIMENSION on each axis before decoding to raw RGBA,
  // so that the uncompressed buffer and BFS arrays stay within a predictable memory bound.
  const resized = await sharp(buffer, { failOn: "warning" })
    .resize(MAX_RAW_DIMENSION, MAX_RAW_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const { data, info } = await sharp(resized, { failOn: "warning" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const width = info.width;
  const height = info.height;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  const idx = (x: number, y: number) => y * width + x;
  const isBackgroundTone = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const a = pixels[offset + 3];
    if (a <= 10) return false;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;

    // White matte background (legacy uploads).
    const nearWhite = r >= 232 && g >= 232 && b >= 232 && chroma <= 16;

    // Checkerboard-style background (PNG editor preview baked into file).
    const avg = (r + g + b) / 3;
    const checkerTone = avg >= 150 && avg <= 230 && chroma <= 14;

    return nearWhite || checkerTone;
  };

  const enqueue = (pixelIndex: number) => {
    if (visited[pixelIndex]) return;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  for (let x = 0; x < width; x++) {
    const top = idx(x, 0);
    const bottom = idx(x, height - 1);
    if (isBackgroundTone(top)) enqueue(top);
    if (isBackgroundTone(bottom)) enqueue(bottom);
  }
  for (let y = 0; y < height; y++) {
    const left = idx(0, y);
    const right = idx(width - 1, y);
    if (isBackgroundTone(left)) enqueue(left);
    if (isBackgroundTone(right)) enqueue(right);
  }

  while (head < tail) {
    const pixelIndex = queue[head++];
    const offset = pixelIndex * 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    // Remove only edge-connected background pixels.
    pixels[offset + 3] = 0;

    if (x > 0) {
      const n = pixelIndex - 1;
      if (!visited[n] && isBackgroundTone(n)) enqueue(n);
    }
    if (x < width - 1) {
      const n = pixelIndex + 1;
      if (!visited[n] && isBackgroundTone(n)) enqueue(n);
    }
    if (y > 0) {
      const n = pixelIndex - width;
      if (!visited[n] && isBackgroundTone(n)) enqueue(n);
    }
    if (y < height - 1) {
      const n = pixelIndex + width;
      if (!visited[n] && isBackgroundTone(n)) enqueue(n);
    }
  }

  return sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PNG file is required" }, { status: 400 });
    }

    const fileType = (file.type || "").toLowerCase();
    const fileName = String(file.name || "").toLowerCase();
    const looksLikePng = fileName.endsWith(".png");
    if ((fileType && !ACCEPTED_PNG_MIME_TYPES.has(fileType)) || (!fileType && !looksLikePng)) {
      return NextResponse.json({ error: "Only PNG files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File must be smaller than ${MAX_SIZE_MB}MB` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }

    if (!hasPngSignature(buffer)) {
      return NextResponse.json({ error: "Only PNG files are allowed" }, { status: 400 });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const relativeDir = path.join("images", "perfumes");
    const uploadDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(uploadDir, { recursive: true });

    const webpPath = path.join(uploadDir, `${id}.webp`);
    const pngPath = path.join(uploadDir, `${id}.png`);
    let imageUrl = "";
    let fallbackUrl = "";

    try {
      const metadata = await sharp(buffer, { failOn: "warning" }).metadata();
      if (metadata.format !== "png") {
        return NextResponse.json({ error: "Only PNG files are allowed" }, { status: 400 });
      }

      const transparentSource = await removeNearWhiteBackground(buffer);

      const composed = await sharp(transparentSource, { failOn: "warning" })
        .resize(CANVAS_SIZE, CANVAS_SIZE, {
          fit: "contain",
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();

      await Promise.all([
        sharp(composed).webp({ quality: 86 }).toFile(webpPath),
        sharp(composed).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath),
      ]);

      imageUrl = `/${relativeDir.replace(/\\/g, "/")}/${id}.webp`;
      fallbackUrl = `/${relativeDir.replace(/\\/g, "/")}/${id}.png`;
    } catch (decodeError) {
      console.warn("Sharp could not decode PNG; using raw PNG fallback", decodeError);
      await writeFile(pngPath, buffer);
      imageUrl = `/${relativeDir.replace(/\\/g, "/")}/${id}.png`;
      fallbackUrl = imageUrl;
    }

    return NextResponse.json({
      imageUrl,
      fallbackUrl,
      urls: {
        webp: imageUrl.endsWith(".webp") ? imageUrl : "",
        png: fallbackUrl,
      },
    });
  } catch (error: unknown) {
    console.error("Error processing perfume image upload:", error);
    const message = error instanceof Error ? error.message : "Image upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
