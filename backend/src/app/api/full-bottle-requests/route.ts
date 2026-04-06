import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { validateBatch, validatePhone, validateString } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const productName = String(body.product || body.perfumeName || "").trim();
    const message = String(body.message || `I want full bottle of ${productName || "this perfume"}`).trim();

    const validation = validateBatch([
      validateString(body.name, "name", { minLength: 2, maxLength: 100 }),
      validatePhone(body.phone, "phone"),
      validateString(productName, "product", { minLength: 2, maxLength: 200 }),
      validateString(message, "message", { minLength: 8, maxLength: 500 }),
    ]);

    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    const id = uuid();
    const now = Timestamp.now();
    const payload = {
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      product: productName,
      perfumeId: String(body.perfumeId || "").trim() || null,
      message,
      channel: body.channel === "whatsapp" ? "whatsapp" : "web_form",
      status: "new",
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(Collections.fullBottleLeads).doc(id).set(payload);
    return NextResponse.json(serializeDoc({ id, ...payload }), { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit full bottle request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
