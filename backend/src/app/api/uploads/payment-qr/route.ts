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
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPG, or WEBP files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File must be smaller than ${MAX_SIZE_MB}MB` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const relativeDir = path.join("images", "payments");
    const uploadDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(uploadDir, { recursive: true });

    const outPath = path.join(uploadDir, `${id}.webp`);
    await sharp(buffer)
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(outPath);

    return NextResponse.json({
      imageUrl: `/${relativeDir.replace(/\\/g, "/")}/${id}.webp`,
    });
  } catch (error: unknown) {
    console.error("Error processing payment QR upload:", error);
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
