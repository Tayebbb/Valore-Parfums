import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { CUSTOMER_MESSAGES } from "@/lib/customer-repository";
import {
  campaignSummary,
  sendNextCustomerEmail,
  type CustomerCampaign,
} from "@/lib/customer-campaigns";
import { isEmailConfigured } from "@/lib/email";
import { customerEmailSetupError } from "@/lib/customer-message";
import { CUSTOMER_MESSAGE_ID } from "@/lib/customer-request";

export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!CUSTOMER_MESSAGE_ID.test(id))
    return NextResponse.json({ error: "Invalid message ID." }, { status: 400 });
  try {
    const ref = db.collection(CUSTOMER_MESSAGES).doc(id.toLowerCase());
    const snapshot = await ref.get();
    if (!snapshot.exists)
      return NextResponse.json(
        { error: "Message not found." },
        { status: 404 },
      );
    const deliveries = await ref.collection("deliveries").get();
    return NextResponse.json(
      {
        ...campaignSummary(snapshot.data() as CustomerCampaign),
        issues: deliveries.docs
          .map((doc) => doc.data())
          .filter(
            (delivery) =>
              delivery.status !== "sent" && delivery.status !== "sending",
          ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Customer message status failed", error);
    return NextResponse.json(
      { error: "Could not load delivery results." },
      { status: 500 },
    );
  }
}

export async function POST(_req: Request, context: Context) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!CUSTOMER_MESSAGE_ID.test(id))
    return NextResponse.json({ error: "Invalid message ID." }, { status: 400 });
  const setupError = !isEmailConfigured()
    ? "Email delivery is not configured."
    : customerEmailSetupError();
  if (setupError)
    return NextResponse.json({ error: setupError }, { status: 503 });
  try {
    const result = await sendNextCustomerEmail(id.toLowerCase());
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Message not found." }, { status: 404 });
  } catch (error) {
    console.error("Customer message delivery interrupted", error);
    return NextResponse.json(
      {
        error:
          "Sending was interrupted. Use Resume in message history to continue without resending completed emails.",
      },
      { status: 500 },
    );
  }
}
