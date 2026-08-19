// ─── Investment buyback service ────────────────────────
// Buyback = store repurchases the investor's remaining funded inventory at
// pure remaining-capital value plus any unwithdrawn profit. After buyback the
// stock belongs to the store outright (allocations marked bought_back; the
// physical stock STAYS in perfumes.totalStockMl — it is now store-owned).

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { db as defaultDb, Collections } from "@/lib/firebase-admin";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { computeBuybackAmount, validateInvariant } from "./finance";
import type { BuybackDoc, InvestmentAllocationDoc, InvestmentDoc, LedgerEntryDoc } from "./types";

export interface BuybackQuote {
  investmentId: string;
  remainingInventoryCostMinor: number;
  availableProfitMinor: number;
  totalAmountMinor: number;
  openAllocations: Array<{ allocationId: string; perfumeId: string; perfumeName: string; remainingMl: number }>;
}

export class InvestmentBuybackService {
  private db: Firestore;

  constructor(firestore: Firestore = defaultDb) {
    this.db = firestore;
  }

  /** Read-only quote: what the store owes to close this investment now. */
  async quote(investmentId: string): Promise<BuybackQuote> {
    const invSnap = await this.db.collection(Collections.investments).doc(investmentId).get();
    if (!invSnap.exists) throw new Error("Investment not found");
    const inv = invSnap.data() as InvestmentDoc;
    if (inv.status === "closed" || inv.status === "bought_back") {
      throw new Error(`Investment is already ${inv.status}`);
    }

    const allocSnap = await this.db
      .collection(Collections.investmentAllocations)
      .where("investmentId", "==", investmentId)
      .get();
    const open = allocSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as InvestmentAllocationDoc) }))
      .filter((a) => a.status === "open" && a.remainingMl > 0);

    return {
      investmentId,
      remainingInventoryCostMinor: inv.remainingInventoryCostMinor,
      availableProfitMinor: inv.availableProfitMinor,
      totalAmountMinor: computeBuybackAmount(inv),
      openAllocations: open.map((a) => ({
        allocationId: a.id,
        perfumeId: a.perfumeId,
        perfumeName: a.perfumeName,
        remainingMl: a.remainingMl,
      })),
    };
  }

  /**
   * Execute buyback atomically:
   *  - all open allocations → bought_back (stock becomes store-owned; no
   *    perfumes.totalStockMl change — bottles stay sellable)
   *  - investment → bought_back; balances zeroed via capital "recovery"
   *  - buyback + investment_closed ledger entries
   *  - buyback record + investor counters
   */
  async execute(input: {
    investmentId: string;
    performedBy: string;
    notes?: string;
  }): Promise<{ buybackId: string; totalAmountMinor: number }> {
    const { investmentId, performedBy } = input;
    const invRef = this.db.collection(Collections.investments).doc(investmentId);
    const buybackRef = this.db.collection(Collections.buybacks).doc();
    let totalAmountMinor = 0;

    await this.db.runTransaction(async (tx) => {
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists) throw new Error("Investment not found");
      const inv = invSnap.data() as InvestmentDoc;
      if (inv.status === "closed" || inv.status === "bought_back") {
        throw new Error(`Investment is already ${inv.status}`);
      }

      const allocQuery = await tx.get(
        this.db
          .collection(Collections.investmentAllocations)
          .where("investmentId", "==", investmentId)
      );
      const openAllocs = allocQuery.docs
        .map((d) => ({ id: d.id, ...(d.data() as InvestmentAllocationDoc) }))
        .filter((a) => a.status === "open" && a.remainingMl > 0);

      // Sanity: remaining capital must equal Σ remainingMl × costPerMl.
      const lotSum = openAllocs.reduce((s, a) => s + a.remainingMl * a.costPerMlMinor, 0);
      if (lotSum !== inv.remainingInventoryCostMinor) {
        throw new Error(
          `Buyback blocked: lot capital (${lotSum}) ≠ remainingInventoryCost (${inv.remainingInventoryCostMinor}). Run reconciliation.`
        );
      }

      totalAmountMinor = computeBuybackAmount(inv);
      // Only positive profit is paid out; a negative profit balance is
      // written off (ledgered) — the store absorbs it, never claws back.
      const paidProfitMinor = Math.max(0, inv.availableProfitMinor);
      const now = Timestamp.now();

      // Close all open lots — ownership transfers to store.
      for (const a of openAllocs) {
        tx.update(this.db.collection(Collections.investmentAllocations).doc(a.id), {
          status: "bought_back",
        });
      }

      // Zero balances; recovered := principal so the invariant closes at 100%.
      const err = validateInvariant({
        amountMinor: inv.amountMinor,
        recoveredCapitalMinor: inv.recoveredCapitalMinor + inv.remainingInventoryCostMinor,
        remainingInventoryCostMinor: 0,
      });
      if (err) throw new Error(err);

      tx.update(invRef, {
        status: "bought_back",
        recoveredCapitalMinor: inv.recoveredCapitalMinor + inv.remainingInventoryCostMinor,
        remainingInventoryCostMinor: 0,
        availableProfitMinor: 0,
        withdrawnProfitMinor: inv.withdrawnProfitMinor + paidProfitMinor,
        buybackAt: now,
        closedAt: now,
      });

      const buyback: BuybackDoc = {
        investmentId,
        investorId: inv.investorId,
        remainingInventoryCostMinor: inv.remainingInventoryCostMinor,
        availableProfitMinor: paidProfitMinor,
        totalAmountMinor,
        returnedMlByAllocation: openAllocs.map((a) => ({
          allocationId: a.id,
          perfumeId: a.perfumeId,
          ml: a.remainingMl,
        })),
        performedBy,
        notes: input.notes || "",
        createdAt: now,
      };
      tx.set(buybackRef, buyback);

      const ledgerBase = {
        investmentId,
        investorId: inv.investorId,
        referenceOrderId: null,
        referenceOrderItemId: null,
        referenceInventoryId: buybackRef.id,
        referencePerfumeId: null,
        mlSold: null,
        performedBy,
        createdAt: now,
      };
      // One ledger entry per stream — streams are never mixed, so every
      // balance stays reproducible by replaying its own stream.
      const buybackEntry: LedgerEntryDoc = {
        ...ledgerBase,
        type: "buyback",
        stream: "capital",
        amountMinor: inv.remainingInventoryCostMinor,
        previousBalanceMinor: inv.recoveredCapitalMinor,
        newBalanceMinor: inv.recoveredCapitalMinor + inv.remainingInventoryCostMinor,
        notes: `Buyback: remaining inventory cost ${inv.remainingInventoryCostMinor} repurchased by store`,
        idempotencyKey: `${investmentId}_buyback`,
      };
      tx.create(
        this.db.collection(Collections.investmentTransactions).doc(buybackEntry.idempotencyKey),
        buybackEntry
      );

      if (paidProfitMinor > 0) {
        const profitPayout: LedgerEntryDoc = {
          ...ledgerBase,
          type: "profit_withdrawal",
          stream: "profit",
          amountMinor: -paidProfitMinor,
          previousBalanceMinor: inv.availableProfitMinor,
          newBalanceMinor: 0,
          notes: `Buyback: unwithdrawn profit ${paidProfitMinor} paid out`,
          idempotencyKey: `${investmentId}_buyback_profit`,
        };
        tx.create(
          this.db.collection(Collections.investmentTransactions).doc(profitPayout.idempotencyKey),
          profitPayout
        );
      } else if (inv.availableProfitMinor < 0) {
        const writeOff: LedgerEntryDoc = {
          ...ledgerBase,
          type: "adjustment",
          stream: "profit",
          amountMinor: -inv.availableProfitMinor, // positive: brings balance to 0
          previousBalanceMinor: inv.availableProfitMinor,
          newBalanceMinor: 0,
          notes: `Buyback: negative profit ${inv.availableProfitMinor} written off (absorbed by store)`,
          idempotencyKey: `${investmentId}_buyback_writeoff`,
        };
        tx.create(
          this.db.collection(Collections.investmentTransactions).doc(writeOff.idempotencyKey),
          writeOff
        );
      }

      const closedEntry: LedgerEntryDoc = {
        ...ledgerBase,
        type: "investment_closed",
        stream: "none",
        amountMinor: 0,
        previousBalanceMinor: 0,
        newBalanceMinor: 0,
        notes: input.notes || "Closed via buyback",
        idempotencyKey: `${investmentId}_closed`,
      };
      tx.create(
        this.db.collection(Collections.investmentTransactions).doc(closedEntry.idempotencyKey),
        closedEntry
      );

      tx.update(this.db.collection(Collections.investors).doc(inv.investorId), {
        totalRecoveredCapitalMinor: FieldValue.increment(inv.remainingInventoryCostMinor),
        totalWithdrawnMinor: FieldValue.increment(paidProfitMinor),
        activeInvestmentCount: FieldValue.increment(-1),
        completedInvestmentCount: FieldValue.increment(1),
        updatedAt: now,
      });
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_BUYBACK,
      userId: performedBy,
      userEmail: "",
      userName: "",
      resource: "investment",
      resourceId: investmentId,
      changes: {},
      details: { buybackId: buybackRef.id, totalAmountMinor },
      status: "success",
    });

    return { buybackId: buybackRef.id, totalAmountMinor };
  }
}

export const investmentBuyback = new InvestmentBuybackService();
