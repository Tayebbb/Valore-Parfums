import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { validateBatch, validateNumber, validateString } from "@/lib/validation";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const perfumeId = searchParams.get("perfumeId");
    if (!perfumeId) {
      return NextResponse.json({ error: "perfumeId is required" }, { status: 400 });
    }

    let snap;
    try {
      snap = await db
        .collection(Collections.perfumeReviews)
        .where("perfumeId", "==", perfumeId)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    } catch {
      // Fallback when compound index/orderBy is unavailable in production.
      snap = await db
        .collection(Collections.perfumeReviews)
        .where("perfumeId", "==", perfumeId)
        .limit(50)
        .get();
    }

    const reviews = snap.docs
      .map((doc) => serializeDoc({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = new Date(String((a as { createdAt?: string }).createdAt || 0)).getTime();
        const bTime = new Date(String((b as { createdAt?: string }).createdAt || 0)).getTime();
        return bTime - aTime;
      });
    const total = reviews.reduce((sum, review) => sum + Number((review as { rating?: number }).rating || 0), 0);
    const average = reviews.length > 0 ? total / reviews.length : 0;

    return NextResponse.json({
      perfumeId,
      averageRating: Number(average.toFixed(2)),
      reviewCount: reviews.length,
      reviews,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load reviews";
    return NextResponse.json(
      {
        error: message,
        averageRating: 0,
        reviewCount: 0,
        reviews: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateBatch([
      validateString(body.perfumeId, "perfumeId", { minLength: 6, maxLength: 120 }),
      validateString(body.name, "name", { minLength: 2, maxLength: 100 }),
      validateNumber(body.rating, "rating", { min: 1, max: 5 }),
      validateString(body.comment, "comment", { minLength: 15, maxLength: 500 }),
    ]);

    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    const id = uuid();
    const now = Timestamp.now();
    const payload = {
      perfumeId: String(body.perfumeId).trim(),
      name: String(body.name).trim(),
      rating: Number(body.rating),
      comment: String(body.comment).trim(),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(Collections.perfumeReviews).doc(id).set(payload);
    return NextResponse.json(serializeDoc({ id, ...payload }), { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
