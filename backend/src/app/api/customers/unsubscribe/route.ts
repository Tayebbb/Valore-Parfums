import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import {
  customerEmailId,
  verifyUnsubscribeToken,
} from "@/lib/customer-message";
import { EMAIL_PREFERENCES } from "@/lib/customer-repository";
import { CustomerRequestError, readCustomerJson } from "@/lib/customer-request";

export async function POST(req: Request) {
  let body: { token?: unknown } | null;
  try {
    body = (await readCustomerJson(req, 4096)) as { token?: unknown } | null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: error instanceof CustomerRequestError ? error.status : 400 },
    );
  }
  if (typeof body?.token !== "string")
    return NextResponse.json(
      { error: "Use the unsubscribe link in your email." },
      { status: 400 },
    );
  try {
    const email = verifyUnsubscribeToken(body.token);
    if (!email)
      return NextResponse.json(
        {
          error:
            "This unsubscribe link is invalid. Please use the link in your email.",
        },
        { status: 400 },
      );
    const ref = db.collection(EMAIL_PREFERENCES).doc(customerEmailId(email));
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.data()?.unsubscribed === true) return;
      tx.set(ref, {
        ...existing.data(),
        email,
        unsubscribed: true,
        unsubscribedAt: new Date().toISOString(),
      });
    });
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Customer unsubscribe failed", error);
    return NextResponse.json(
      { error: "Could not save your preference. Please try again." },
      { status: 500 },
    );
  }
}
