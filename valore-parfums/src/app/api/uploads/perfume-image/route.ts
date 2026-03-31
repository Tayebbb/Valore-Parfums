import { NextResponse } from "next/server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_SIZE_MB = 8;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PNG file is required" }, { status: 400 });
    }

    if (file.type !== "image/png") {
      return NextResponse.json({ error: "Only PNG files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File must be smaller than ${MAX_SIZE_MB}MB` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const relativeDir = path.join("images", "perfumes");
    const uploadDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(uploadDir, { recursive: true });

    const canvas = 1200;
    const base = sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 4,
        background: "#f4f1ea",
      },
    });

    const gradientSvg = Buffer.from(`<svg width=\"1200\" height=\"1200\" xmlns=\"http://www.w3.org/2000/svg\"><defs><radialGradient id=\"g\" cx=\"50%\" cy=\"40%\" r=\"70%\"><stop offset=\"0%\" stop-color=\"#ffffff\" stop-opacity=\"0.85\"/><stop offset=\"100%\" stop-color=\"#e5ddd1\" stop-opacity=\"1\"/></radialGradient></defs><rect width=\"1200\" height=\"1200\" fill=\"url(#g)\"/></svg>`);

    const image = await sharp(buffer)
      .resize(980, 980, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    const composed = await base
      .composite([
        { input: gradientSvg, blend: "over" },
        { input: image, gravity: "center" },
      ])
      .toBuffer();

    const webpPath = path.join(uploadDir, `${id}.webp`);
    const pngPath = path.join(uploadDir, `${id}.png`);
    await Promise.all([
      sharp(composed).webp({ quality: 86 }).toFile(webpPath),
      sharp(composed).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath),
    ]);

    return NextResponse.json({
      imageUrl: `/${relativeDir.replace(/\\/g, "/")}/${id}.webp`,
      fallbackUrl: `/${relativeDir.replace(/\\/g, "/")}/${id}.png`,
    });
  } catch (error: unknown) {
    console.error("Error processing perfume image upload:", error);
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
