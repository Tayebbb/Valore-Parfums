// ─── Investment withdrawal service ─────────────────────
// ONLY availableProfitMinor (Stream B) is withdrawable. Capital is returned
// exclusively through sales (capital_recovery) or buyback — never here.
// Workflow: pending → approved | rejected; approved → paid.
// The profit is deducted at APPROVAL time (inside a transaction that
// re-validates the balance) so double-approval / races cannot overdraw.

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { db as defaultDb, Collections } from "@/lib/firebase-admin";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import type { InvestmentDoc, InvestmentWithdrawalDoc, LedgerEntryDoc } from "./types";

export class InvestmentWithdrawalService {
  private db: Firestore;

  constructor(firestore: Firestore = defaultDb) {
    this.db = firestore;
  }

  /** Create a pending withdrawal request. Validates amount at request time. */
  async request(input: {
    investmentId: string;
    amountMinor: number;
    paymentSource: "Bkash" | "Bank" | "Cash";
    requestedBy: string;
    /** When set, request is only allowed for this investor (IDOR guard). */
    restrictToInvestorId?: string;
    notes?: string;
  }): Promise<{ withdrawalId: string }> {
    const { investmentId, amountMinor, requestedBy } = input;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error("Withdrawal amount must be a positive integer (minor units)");
    }

    const invSnap = await this.db.collection(Collections.investments).doc(investmentId).get();
    if (!invSnap.exists) throw new Error("Investment not found");
    const inv = invSnap.data() as InvestmentDoc;
    if (input.restrictToInvestorId && inv.investorId !== input.restrictToInvestorId) {
      throw new Error("Forbidden: investment does not belong to this investor");
    }
    if (inv.status === "closed" || inv.status === "bought_back") {
      throw new Error(`Investment is ${inv.status}; no withdrawals possible`);
    }
    if (amountMinor > inv.availableProfitMinor) {
      throw new Error(
        `Requested ${amountMinor} exceeds available profit ${inv.availableProfitMinor}`
      );
    }

    const ref = this.db.collection(Collections.investmentWithdrawals).doc();
    const doc: InvestmentWithdrawalDoc = {
      investmentId,
      investorId: inv.investorId,
      amountMinor,
      status: "pending",
      paymentSource: input.paymentSource,
      requestedBy,
      decidedBy: null,
      decidedAt: null,
      rejectReason: "",
      notes: input.notes || "",
      createdAt: Timestamp.now(),
    };
    await ref.set(doc);

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_WITHDRAWAL_REQUESTED,
      userId: requestedBy,
      userEmail: "",
      userName: "",
      resource: "investmentWithdrawal",
      resourceId: ref.id,
      changes: {},
      details: { investmentId, amountMinor, paymentSource: input.paymentSource },
      status: "success",
    });

    return { withdrawalId: ref.id };
  }

  /**
   * Approve: atomically re-validate balance, deduct availableProfit, bump
   * withdrawnProfit, write immutable profit_withdrawal ledger entry.
   */
  async approve(input: { withdrawalId: string; decidedBy: string }): Promise<void> {
    const { withdrawalId, decidedBy } = input;
    const wRef = this.db.collection(Collections.investmentWithdrawals).doc(withdrawalId);

    await this.db.runTransaction(async (tx) => {
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists) throw new Error("Withdrawal not found");
      const w = wSnap.data() as InvestmentWithdrawalDoc;
      if (w.status !== "pending") throw new Error(`Withdrawal is already ${w.status}`);

      const invRef = this.db.collection(Collections.investments).doc(w.investmentId);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists) throw new Error("Investment not found");
      const inv = invSnap.data() as InvestmentDoc;

      if (w.amountMinor > inv.availableProfitMinor) {
        throw new Error(
          `Insufficient profit: ${inv.availableProfitMinor} available, ${w.amountMinor} requested`
        );
      }

      const now = Timestamp.now();
      const newAvailable = inv.availableProfitMinor - w.amountMinor;

      tx.update(invRef, {
        availableProfitMinor: newAvailable,
        withdrawnProfitMinor: inv.withdrawnProfitMinor + w.amountMinor,
      });
      tx.update(wRef, { status: "approved", decidedBy, decidedAt: now });
      tx.update(this.db.collection(Collections.investors).doc(w.investorId), {
        totalWithdrawnMinor: FieldValue.increment(w.amountMinor),
        updatedAt: now,
      });

      const entry: LedgerEntryDoc = {
        type: "profit_withdrawal",
        stream: "profit",
        investmentId: w.investmentId,
        investorId: w.investorId,
        referenceOrderId: null,
        referenceOrderItemId: null,
        referenceInventoryId: withdrawalId,
        referencePerfumeId: null,
        amountMinor: -w.amountMinor,
        mlSold: null,
        previousBalanceMinor: inv.availableProfitMinor,
        newBalanceMinor: newAvailable,
        performedBy: decidedBy,
        notes: `Withdrawal approved (${w.paymentSource})`,
        idempotencyKey: `${withdrawalId}_withdrawal`,
        createdAt: now,
      };
      // create() — a replayed approval fails on the existing ledger doc.
      tx.create(
        this.db.collection(Collections.investmentTransactions).doc(entry.idempotencyKey),
        entry
      );
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_WITHDRAWAL_APPROVED,
      userId: decidedBy,
      userEmail: "",
      userName: "",
      resource: "investmentWithdrawal",
      resourceId: withdrawalId,
      changes: {},
      status: "success",
    });
  }

  /** Reject a pending request. No balance changes. */
  async reject(input: {
    withdrawalId: string;
    decidedBy: string;
    reason: string;
  }): Promise<void> {
    const { withdrawalId, decidedBy, reason } = input;
    if (!reason.trim()) throw new Error("Rejection reason is required");
    const wRef = this.db.collection(Collections.investmentWithdrawals).doc(withdrawalId);

    await this.db.runTransaction(async (tx) => {
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists) throw new Error("Withdrawal not found");
      const w = wSnap.data() as InvestmentWithdrawalDoc;
      if (w.status !== "pending") throw new Error(`Withdrawal is already ${w.status}`);
      tx.update(wRef, {
        status: "rejected",
        decidedBy,
        decidedAt: Timestamp.now(),
        rejectReason: reason,
      });
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_WITHDRAWAL_REJECTED,
      userId: decidedBy,
      userEmail: "",
      userName: "",
      resource: "investmentWithdrawal",
      resourceId: withdrawalId,
      changes: {},
      status: "success",
      reason,
    });
  }

  /** Mark an approved withdrawal as physically paid out. */
  async markPaid(input: { withdrawalId: string; decidedBy: string }): Promise<void> {
    const { withdrawalId, decidedBy } = input;
    const wRef = this.db.collection(Collections.investmentWithdrawals).doc(withdrawalId);

    await this.db.runTransaction(async (tx) => {
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists) throw new Error("Withdrawal not found");
      const w = wSnap.data() as InvestmentWithdrawalDoc;
      if (w.status !== "approved") {
        throw new Error(`Only approved withdrawals can be paid (currently ${w.status})`);
      }
      tx.update(wRef, { status: "paid", decidedBy, decidedAt: Timestamp.now() });
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_WITHDRAWAL_PAID,
      userId: decidedBy,
      userEmail: "",
      userName: "",
      resource: "investmentWithdrawal",
      resourceId: withdrawalId,
      changes: {},
      details: { status: "paid" },
      status: "success",
    });
  }
}

export const investmentWithdrawals = new InvestmentWithdrawalService();
