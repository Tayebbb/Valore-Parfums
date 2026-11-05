import { db } from "./prisma";
import {
  customerEmailId,
  generateCustomerMessage,
  type CustomerMessage,
} from "./customer-message";
import { CUSTOMER_MESSAGES, EMAIL_PREFERENCES } from "./customer-repository";
import { sendEmail } from "./email";

export interface CustomerCampaign extends CustomerMessage {
  id: string;
  fingerprint: string;
  recipients: string[];
  nextIndex: number;
  sent: number;
  failed: number;
  skipped: number;
  uncertain: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  nextSendAt?: number;
}

export function campaignSummary(campaign: CustomerCampaign) {
  return {
    id: campaign.id,
    subject: campaign.subject,
    format: campaign.format,
    nextIndex: campaign.nextIndex,
    sent: campaign.sent,
    failed: campaign.failed,
    skipped: campaign.skipped,
    uncertain: campaign.uncertain,
    createdAt: campaign.createdAt,
    createdBy: campaign.createdBy,
    updatedAt: campaign.updatedAt,
    total: campaign.recipients.length,
    done: campaign.nextIndex >= campaign.recipients.length,
  };
}

/** Claim one recipient transactionally. Never resend a claimed email after an ambiguous crash. */
export async function sendNextCustomerEmail(id: string) {
  const ref = db.collection(CUSTOMER_MESSAGES).doc(id);
  // Shared by all campaigns and server instances, not just one browser tab.
  const dispatchRef = db.collection("customerMessageDispatch").doc("provider");
  const claim = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { kind: "missing" as const };
    const campaign = snapshot.data() as CustomerCampaign;
    if (campaign.nextIndex >= campaign.recipients.length)
      return { kind: "done" as const, campaign };
    const email = campaign.recipients[campaign.nextIndex];
    const deliveryRef = ref
      .collection("deliveries")
      .doc(customerEmailId(email));
    const [delivery, preference, dispatch] = await Promise.all([
      tx.get(deliveryRef),
      tx.get(db.collection(EMAIL_PREFERENCES).doc(customerEmailId(email))),
      tx.get(dispatchRef),
    ]);
    const now = Date.now();
    if (delivery.exists && Number(delivery.data()?.claimedAt) + 120000 > now) {
      return { kind: "waiting" as const, campaign, retryAfter: 2 };
    }
    if (delivery.exists || preference.data()?.unsubscribed === true) {
      const uncertain = delivery.exists;
      const updated = {
        ...campaign,
        nextIndex: campaign.nextIndex + 1,
        uncertain: campaign.uncertain + (uncertain ? 1 : 0),
        skipped: campaign.skipped + (uncertain ? 0 : 1),
        updatedAt: new Date().toISOString(),
      };
      tx.set(deliveryRef, {
        email,
        status: uncertain ? "uncertain" : "skipped",
        error: uncertain
          ? "Delivery was interrupted. Check the email provider before sending again."
          : "Customer unsubscribed.",
        updatedAt: updated.updatedAt,
      });
      tx.update(ref, {
        nextIndex: updated.nextIndex,
        uncertain: updated.uncertain,
        skipped: updated.skipped,
        updatedAt: updated.updatedAt,
      });
      return { kind: "done" as const, campaign: updated };
    }
    if (Number(campaign.nextSendAt || 0) > now)
      return { kind: "waiting" as const, campaign, retryAfter: 1 };
    const gate = dispatch.data();
    const availableAt = Math.max(
      Number(gate?.leaseUntil || 0),
      Number(gate?.nextSendAt || 0),
    );
    if (availableAt > now)
      return {
        kind: "waiting" as const,
        campaign,
        retryAfter: Math.min(
          5,
          Math.max(1, Math.ceil((availableAt - now) / 1000)),
        ),
      };
    const claimId = `${id}/${campaign.nextIndex}`;
    tx.create(deliveryRef, { email, status: "sending", claimedAt: now });
    tx.set(dispatchRef, { claimId, leaseUntil: now + 120000, nextSendAt: 0 });
    return { kind: "send" as const, campaign, email, deliveryRef, claimId };
  });
  if (claim.kind === "missing") return null;
  if (claim.kind !== "send")
    return {
      ...campaignSummary(claim.campaign),
      retryAfter: claim.kind === "waiting" ? claim.retryAfter : 0,
    };

  const notification = generateCustomerMessage(claim.campaign, claim.email);
  notification.idempotencyKey = `customer-message/${id}/${customerEmailId(claim.email)}`;
  const result = await sendEmail(notification);
  // The delivery and cursor commit together. A timeout leaves the claim intact;
  // the next run marks it uncertain instead of sending another copy.
  const updated = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const campaign = snapshot.data() as CustomerCampaign;
    const delivery = await tx.get(claim.deliveryRef);
    const dispatch = await tx.get(dispatchRef);
    if (
      campaign.nextIndex !== claim.campaign.nextIndex ||
      delivery.data()?.status !== "sending"
    )
      return campaign;
    const uncertain = !result.success && result.uncertain === true;
    const next = {
      ...campaign,
      nextIndex: campaign.nextIndex + 1,
      sent: campaign.sent + (result.success ? 1 : 0),
      failed: campaign.failed + (!result.success && !uncertain ? 1 : 0),
      uncertain: campaign.uncertain + (uncertain ? 1 : 0),
      updatedAt: new Date().toISOString(),
      nextSendAt: Date.now() + 750,
    };
    tx.set(claim.deliveryRef, {
      email: claim.email,
      status: result.success ? "sent" : uncertain ? "uncertain" : "failed",
      messageId: result.messageId || "",
      error: result.success
        ? ""
        : (result.error || "Email provider rejected the message.").slice(
            0,
            300,
          ),
      updatedAt: next.updatedAt,
    });
    tx.update(ref, {
      nextIndex: next.nextIndex,
      sent: next.sent,
      failed: next.failed,
      uncertain: next.uncertain,
      updatedAt: next.updatedAt,
      nextSendAt: next.nextSendAt,
    });
    if (dispatch.data()?.claimId === claim.claimId)
      tx.set(dispatchRef, {
        claimId: "",
        leaseUntil: 0,
        nextSendAt: next.nextSendAt,
      });
    return next;
  });
  return { ...campaignSummary(updated), retryAfter: 0 };
}
