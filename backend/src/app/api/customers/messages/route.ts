import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { getCustomers, CUSTOMER_MESSAGES } from "@/lib/customer-repository";
import { normalizeCustomerEmail } from "@/lib/customer-directory";
import {
  customerEmailSetupError,
  parseCustomerMessage,
} from "@/lib/customer-message";
import { isEmailConfigured } from "@/lib/email";
import {
  CUSTOMER_MESSAGE_ID,
  CustomerRequestError,
  readCustomerJson,
} from "@/lib/customer-request";
import {
  campaignSummary,
  type CustomerCampaign,
} from "@/lib/customer-campaigns";

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const snapshot = await db
      .collection(CUSTOMER_MESSAGES)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    return NextResponse.json(
      {
        messages: snapshot.docs.map((doc) =>
          campaignSummary(doc.data() as CustomerCampaign),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Customer message history failed", error);
    return NextResponse.json(
      { error: "Could not load message history. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setupError = !isEmailConfigured()
    ? "Configure Resend or Gmail on the backend before sending."
    : customerEmailSetupError();
  if (setupError)
    return NextResponse.json({ error: setupError }, { status: 503 });
  let body: Record<string, unknown>;
  let message;
  try {
    body = (await readCustomerJson(req)) as Record<string, unknown>;
    message = parseCustomerMessage(body);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: error instanceof CustomerRequestError ? error.status : 400 },
    );
  }
  if (
    typeof body?.requestId !== "string" ||
    !CUSTOMER_MESSAGE_ID.test(body.requestId)
  )
    return NextResponse.json(
      { error: "Invalid message request ID." },
      { status: 400 },
    );
  if (body.audience !== "all" && body.audience !== "selected")
    return NextResponse.json(
      { error: "Choose the message recipients." },
      { status: 400 },
    );
  if (
    body.audience === "selected" &&
    (!Array.isArray(body.emails) ||
      !body.emails.length ||
      body.emails.length > 5000 ||
      body.emails.some((email: unknown) => !normalizeCustomerEmail(email)))
  ) {
    return NextResponse.json(
      { error: "Select between 1 and 5,000 valid customer emails." },
      { status: 400 },
    );
  }
  const selected: string[] =
    body.audience === "selected"
      ? [
          ...new Set<string>(
            (body.emails as unknown[]).map(normalizeCustomerEmail),
          ),
        ].sort()
      : [];
  const selectedEmails = new Set(selected);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...message, audience: body.audience, selected }))
    .digest("hex");
  const ref = db
    .collection(CUSTOMER_MESSAGES)
    .doc(body.requestId.toLowerCase());
  try {
    const existing = await ref.get();
    if (existing.exists) {
      const campaign = existing.data() as CustomerCampaign;
      if (campaign.fingerprint !== fingerprint)
        return NextResponse.json(
          {
            error:
              "This message request was already used. Reopen the composer for a new message.",
          },
          { status: 409 },
        );
      return NextResponse.json(campaignSummary(campaign));
    }
    const customers = await getCustomers();
    const customerEmails = new Set(customers.map((customer) => customer.email));
    if (selected.some((email) => !customerEmails.has(email)))
      return NextResponse.json(
        {
          error:
            "Recipients must be customers who have placed an order. Refresh the directory.",
        },
        { status: 400 },
      );
    const recipients = customers
      .filter(
        (customer) =>
          !customer.unsubscribed &&
          (body.audience === "all" || selectedEmails.has(customer.email)),
      )
      .map((customer) => customer.email);
    if (!recipients.length)
      return NextResponse.json(
        { error: "There are no eligible customers to message." },
        { status: 400 },
      );
    if (recipients.length > 5000)
      return NextResponse.json(
        { error: "Select up to 5,000 customers per message." },
        { status: 400 },
      );
    const campaign: CustomerCampaign = {
      ...message,
      id: ref.id,
      fingerprint,
      recipients,
      nextIndex: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      uncertain: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: admin.email,
    };
    if (Buffer.byteLength(JSON.stringify(campaign), "utf8") > 900000)
      return NextResponse.json(
        {
          error:
            "This message audience is too large. Select fewer customers and try again.",
        },
        { status: 400 },
      );
    const saved = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists) return current.data() as CustomerCampaign;
      tx.create(ref, campaign);
      return campaign;
    });
    if (saved.fingerprint !== fingerprint)
      return NextResponse.json(
        { error: "This request ID belongs to another message." },
        { status: 409 },
      );
    return NextResponse.json(campaignSummary(saved), { status: 201 });
  } catch (error) {
    console.error("Customer message creation failed", error);
    return NextResponse.json(
      {
        error:
          "Could not start sending. Retry with the same message to continue safely.",
      },
      { status: 500 },
    );
  }
}
