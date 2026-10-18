import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCloudinaryFolder, uploadImageBufferToCloudinary } from "@/lib/cloudinary";

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
    const folder = getCloudinaryFolder("images", "payments");
    let uploadBuffer = buffer;
    let format: "png" | "jpg" | "webp" = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    try {
      const { default: sharp } = await import("sharp");
      uploadBuffer = await sharp(buffer)
        .resize(900, 900, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      format = "webp";
    } catch (error) {
      console.warn("Image optimization unavailable; using original payment QR", error);
    }

    const uploaded = await uploadImageBufferToCloudinary(uploadBuffer, {
      folder,
      publicId: `${id}-${format}`,
      format,
    });

    return NextResponse.json({
      imageUrl: uploaded.secure_url,
    });
  } catch (error: unknown) {
    console.error("Error processing payment QR upload:", error);
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
