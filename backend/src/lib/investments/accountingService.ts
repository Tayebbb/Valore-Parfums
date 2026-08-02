// ─── Investment accounting service ─────────────────────
// All mutations run inside db.runTransaction — atomic, all-or-nothing.
// Ledger entries use deterministic doc IDs (idempotencyKey) so replays are
// physically impossible: a second attempt fails the tx existence check.
// The per-investment INVARIANT (principal = recovered + remaining inventory
// cost) is validated INSIDE every transaction; a violation throws → rollback.

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { db as defaultDb, Collections } from "@/lib/firebase-admin";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  allocateSaleFifo,
  planPartialFifoSale,
  splitSale,
  validateInvariant,
  calculatePerfumeCost,
} from "./finance";
import type {
  InvestmentAllocationDoc,
  InvestmentDoc,
  InvestorDoc,
  LedgerEntryDoc,
  LedgerEntryType,
  LedgerStream,
  SaleAllocationInput,
} from "./types";

const DEFAULT_INVESTOR_SHARE_PERCENT = 40;

export interface CreateInvestmentInput {
  investorId: string;
  /** Lots to fund. amountMinor must equal Σ (ml × costPerMlMinor). */
  allocations: Array<{ perfumeId: string; ml: number; costPerMlMinor: number }>;
  amountMinor: number;
  /** Overrides settings/default.defaultInvestorProfitSharePercent. */
  profitSharePercentage?: number;
  performedBy: string;
  notes?: string;
}

export interface ProcessSaleInput {
  perfumeId: string;
  ml: number; // total ml sold from funded stock
  /** Revenue for this quantity, minor units, excluding delivery fee. */
  sellingPriceMinor: number;
  /** Bottle + packaging + label + pouch etc. for this quantity, minor units. */
  sellingCostsMinor: number;
  orderId: string | null;
  orderItemId: string | null;
  performedBy: string;
  /**
   * When true, a sale larger than the open funded stock consumes whatever is
   * funded (FIFO) and prorates revenue/costs by the funded fraction; the
   * unfunded remainder stays with the existing store accounting. When false
   * (default), an oversell throws and the transaction aborts.
   */
  allowPartial?: boolean;
}

export interface ProcessSaleResult {
  processed: boolean; // false when no funded (open) allocations exist
  investmentIds: string[];
  totalCapitalRecoveredMinor: number;
  totalInvestorProfitMinor: number;
  totalBusinessProfitMinor: number;
  /** ml actually consumed from funded lots (≤ requested ml with allowPartial). */
  mlFundedProcessed: number;
}

function ledgerRef(firestore: Firestore, idempotencyKey: string) {
  return firestore.collection(Collections.investmentTransactions).doc(idempotencyKey);
}

export class InvestmentAccountingService {
  private db: Firestore;

  constructor(firestore: Firestore = defaultDb) {
    this.db = firestore;
  }

  /** Resolve default investor profit share from settings/default (never hardcoded). */
  async getDefaultInvestorSharePercent(): Promise<number> {
    const snap = await this.db.collection(Collections.settings).doc("default").get();
    const raw = snap.exists ? (snap.data()?.defaultInvestorProfitSharePercent as number) : undefined;
    if (typeof raw === "number" && raw >= 0 && raw <= 100) return raw;
    return DEFAULT_INVESTOR_SHARE_PERCENT;
  }

  /**
   * Create an investment: investment doc + one allocation per lot + funding
   * ledger entries + perfume stock increments + investor counters. One tx.
   */
  async createInvestment(input: CreateInvestmentInput): Promise<{ investmentId: string }> {
    const { investorId, allocations, amountMinor, performedBy } = input;
    if (!allocations.length) throw new Error("At least one allocation is required");
    if (amountMinor <= 0) throw new Error("Investment amount must be positive");

    // Validate amount = Σ ml × costPerMl exactly (no silent drift).
    const computed = allocations.reduce(
      (sum, a) => sum + calculatePerfumeCost(a.ml, a.costPerMlMinor),
      0
    );
    if (computed !== amountMinor) {
      throw new Error(
        `Investment amount mismatch: allocations total ${computed} but amount is ${amountMinor}`
      );
    }

    const share =
      typeof input.profitSharePercentage === "number"
        ? input.profitSharePercentage
        : await this.getDefaultInvestorSharePercent();
    if (share < 0 || share > 100) throw new Error("profitSharePercentage must be 0–100");

    const investmentRef = this.db.collection(Collections.investments).doc();
    const investorRef = this.db.collection(Collections.investors).doc(investorId);
    const perfumeRefs = allocations.map((a) =>
      this.db.collection(Collections.perfumes).doc(a.perfumeId)
    );

    await this.db.runTransaction(async (tx) => {
      const investorSnap = await tx.get(investorRef);
      if (!investorSnap.exists) throw new Error("Investor not found");
      const investor = investorSnap.data() as InvestorDoc;
      if (investor.status !== "active") throw new Error("Investor is not active");

      const perfumeSnaps = await Promise.all(perfumeRefs.map((r) => tx.get(r)));
      perfumeSnaps.forEach((snap, i) => {
        if (!snap.exists) throw new Error(`Perfume ${allocations[i].perfumeId} not found`);
        if (snap.data()?.isPersonalCollection === true) {
          throw new Error(
            `Perfume ${allocations[i].perfumeId} is a personal-collection bottle and cannot be investor-funded`
          );
        }
      });

      const now = Timestamp.now();
      const investment: InvestmentDoc = {
        investorId,
        investorName: investor.name || "",
        amountMinor,
        remainingInventoryCostMinor: amountMinor,
        recoveredCapitalMinor: 0,
        availableProfitMinor: 0,
        withdrawnProfitMinor: 0,
        profitSharePercentage: share,
        status: "active",
        currency: "BDT",
        createdAt: now,
        closedAt: null,
        buybackAt: null,
        metadata: { notes: input.notes || "" },
      };
      const invariantError = validateInvariant({
        amountMinor,
        recoveredCapitalMinor: 0,
        remainingInventoryCostMinor: amountMinor,
      });
      if (invariantError) throw new Error(invariantError);

      tx.set(investmentRef, investment);

      allocations.forEach((a, i) => {
        const allocationRef = this.db.collection(Collections.investmentAllocations).doc();
        const perfumeName = (perfumeSnaps[i].data()?.name as string) || "";
        const allocation: InvestmentAllocationDoc = {
          investmentId: investmentRef.id,
          investorId,
          perfumeId: a.perfumeId,
          perfumeName,
          fundedMl: a.ml,
          remainingMl: a.ml,
          soldMl: 0,
          costPerMlMinor: a.costPerMlMinor,
          status: "open",
          createdAt: now,
        };
        tx.set(allocationRef, allocation);

        // Funded inventory enters sellable stock.
        tx.update(perfumeRefs[i], {
          totalStockMl: FieldValue.increment(a.ml),
          updatedAt: now,
        });

        const entry: LedgerEntryDoc = {
          type: "inventory_purchased",
          stream: "none",
          investmentId: investmentRef.id,
          investorId,
          referenceOrderId: null,
          referenceOrderItemId: null,
          referenceInventoryId: allocationRef.id,
          referencePerfumeId: a.perfumeId,
          amountMinor: calculatePerfumeCost(a.ml, a.costPerMlMinor),
          mlSold: null,
          previousBalanceMinor: 0,
          newBalanceMinor: 0,
          performedBy,
          notes: `Funded ${a.ml} ml of ${perfumeName}`,
          idempotencyKey: `${investmentRef.id}_funding_${allocationRef.id}`,
          createdAt: now,
        };
        tx.create(ledgerRef(this.db, entry.idempotencyKey), entry);
      });

      const createdEntry: LedgerEntryDoc = {
        type: "investment_created",
        stream: "none",
        investmentId: investmentRef.id,
        investorId,
        referenceOrderId: null,
        referenceOrderItemId: null,
        referenceInventoryId: null,
        referencePerfumeId: null,
        amountMinor,
        mlSold: null,
        previousBalanceMinor: 0,
        newBalanceMinor: 0,
        performedBy,
        notes: input.notes || "",
        idempotencyKey: `${investmentRef.id}_created`,
        createdAt: now,
      };
      tx.create(ledgerRef(this.db, createdEntry.idempotencyKey), createdEntry);

      tx.update(investorRef, {
        totalInvestedMinor: FieldValue.increment(amountMinor),
        activeInvestmentCount: FieldValue.increment(1),
        updatedAt: now,
      });
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_CREATED,
      userId: performedBy,
      userEmail: "",
      userName: "",
      resource: "investment",
      resourceId: investmentRef.id,
      changes: {},
      details: { investorId, amountMinor, allocations: allocations.length },
      status: "success",
    });

    return { investmentId: investmentRef.id };
  }

  /**
   * Process a sale of `ml` of `perfumeId` from investor-funded stock.
   * FIFO across open allocations (oldest investment first), splits every
   * consumed lot into Stream A (capital) + Stream B (profit).
   *
   * Reusable method only — NOT yet wired into order processing (Phase 3).
   * Returns { processed: false } when the perfume has no open funded lots,
   * so callers can fall through to the existing store/personal logic.
   */
  async processInvestmentSale(input: ProcessSaleInput): Promise<ProcessSaleResult> {
    const { perfumeId, ml, sellingPriceMinor, sellingCostsMinor, performedBy } = input;
    if (ml <= 0) throw new Error("ml must be positive");
    if (sellingPriceMinor < 0 || sellingCostsMinor < 0) {
      throw new Error("Selling price/costs cannot be negative");
    }

    // Read open allocations outside tx to build the candidate set, then
    // re-read each inside the tx for correctness.
    const allocSnap = await this.db
      .collection(Collections.investmentAllocations)
      .where("perfumeId", "==", perfumeId)
      .where("status", "==", "open")
      .get();
    if (allocSnap.empty) {
      return {
        processed: false,
        investmentIds: [],
        totalCapitalRecoveredMinor: 0,
        totalInvestorProfitMinor: 0,
        totalBusinessProfitMinor: 0,
        mlFundedProcessed: 0,
      };
    }

    const candidates = allocSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as InvestmentAllocationDoc) }))
      .sort((a, b) => {
        const ta = (a.createdAt as Timestamp)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as Timestamp)?.toMillis?.() ?? 0;
        return ta - tb; // FIFO: oldest lot first
      });

    const result: ProcessSaleResult = {
      processed: true,
      investmentIds: [],
      totalCapitalRecoveredMinor: 0,
      totalInvestorProfitMinor: 0,
      totalBusinessProfitMinor: 0,
      mlFundedProcessed: 0,
    };

    await this.db.runTransaction(async (tx) => {
      // Reset accumulators — Firestore may retry this callback on contention.
      result.processed = true;
      result.investmentIds = [];
      result.totalCapitalRecoveredMinor = 0;
      result.totalInvestorProfitMinor = 0;
      result.totalBusinessProfitMinor = 0;
      result.mlFundedProcessed = 0;

      // Idempotency: refuse to double-process the same order item. Queried
      // (not key-guessed) so it holds even when the FIFO lot set differs
      // between attempts. tx.create on every ledger key is the second wall.
      if (input.orderItemId) {
        const dupSnap = await tx.get(
          this.db
            .collection(Collections.investmentTransactions)
            .where("referenceOrderItemId", "==", input.orderItemId)
            .limit(1)
        );
        if (!dupSnap.empty) {
          throw new Error(`Sale already processed for order item ${input.orderItemId}`);
        }
      }

      // Re-read allocations inside tx (fresh remainingMl).
      const freshAllocs: Array<{ id: string; data: InvestmentAllocationDoc }> = [];
      for (const c of candidates) {
        const snap = await tx.get(
          this.db.collection(Collections.investmentAllocations).doc(c.id)
        );
        if (!snap.exists) continue;
        const data = snap.data() as InvestmentAllocationDoc;
        if (data.status === "open" && data.remainingMl > 0) {
          freshAllocs.push({ id: snap.id, data });
        }
      }

      const fifoInput: SaleAllocationInput[] = freshAllocs.map((a) => ({
        allocationId: a.id,
        remainingMl: a.data.remainingMl,
        costPerMlMinor: a.data.costPerMlMinor,
      }));

      // Effective quantities: with allowPartial a shortfall consumes only the
      // funded ml and prorates revenue/costs; otherwise an oversell throws.
      let effectiveMl = ml;
      let effectivePriceMinor = sellingPriceMinor;
      let effectiveCostsMinor = sellingCostsMinor;
      let consumptions;
      if (input.allowPartial) {
        const plan = planPartialFifoSale(fifoInput, ml);
        if (plan.mlFunded === 0) {
          result.processed = false;
          return;
        }
        effectiveMl = plan.mlFunded;
        consumptions = plan.consumptions;
        if (effectiveMl < ml) {
          effectivePriceMinor = Math.round((sellingPriceMinor * effectiveMl) / ml);
          effectiveCostsMinor = Math.round((sellingCostsMinor * effectiveMl) / ml);
        }
      } else {
        // Throws if funded stock is insufficient → tx aborts, caller handles.
        consumptions = allocateSaleFifo(fifoInput, ml);
      }
      result.mlFundedProcessed = effectiveMl;

      // Load affected investments.
      const investmentIds = [
        ...new Set(
          consumptions.map(
            (c) => freshAllocs.find((a) => a.id === c.allocationId)!.data.investmentId
          )
        ),
      ];
      const investmentSnaps = new Map<string, InvestmentDoc>();
      for (const invId of investmentIds) {
        const snap = await tx.get(this.db.collection(Collections.investments).doc(invId));
        if (!snap.exists) throw new Error(`Investment ${invId} missing for allocation`);
        investmentSnaps.set(invId, snap.data() as InvestmentDoc);
      }

      const now = Timestamp.now();

      // Distribute revenue & selling costs across consumptions pro-rata by ml,
      // remainder to the last lot so totals stay exact.
      let priceLeft = effectivePriceMinor;
      let costsLeft = effectiveCostsMinor;

      consumptions.forEach((consumption, idx) => {
        const alloc = freshAllocs.find((a) => a.id === consumption.allocationId)!;
        const invId = alloc.data.investmentId;
        const inv = investmentSnaps.get(invId)!;
        const isLast = idx === consumptions.length - 1;

        const priceShare = isLast
          ? priceLeft
          : Math.round((effectivePriceMinor * consumption.mlConsumed) / effectiveMl);
        const costsShare = isLast
          ? costsLeft
          : Math.round((effectiveCostsMinor * consumption.mlConsumed) / effectiveMl);
        priceLeft -= priceShare;
        costsLeft -= costsShare;

        const split = splitSale({
          sellingPriceMinor: priceShare,
          sellingCostsMinor: costsShare,
          perfumeCostMinor: consumption.capitalMinor,
          investorSharePercent: inv.profitSharePercentage,
        });

        // ── Mutate allocation ──
        const newRemaining = alloc.data.remainingMl - consumption.mlConsumed;
        tx.update(this.db.collection(Collections.investmentAllocations).doc(alloc.id), {
          remainingMl: newRemaining,
          soldMl: alloc.data.soldMl + consumption.mlConsumed,
          status: newRemaining <= 0 ? "depleted" : "open",
        });

        // ── Mutate investment (validated) ──
        const newRecovered = inv.recoveredCapitalMinor + split.recoveredCapitalMinor;
        const newRemainingCost =
          inv.remainingInventoryCostMinor - split.recoveredCapitalMinor;
        const newAvailableProfit = inv.availableProfitMinor + split.investorProfitMinor;
        const invariantError = validateInvariant({
          amountMinor: inv.amountMinor,
          recoveredCapitalMinor: newRecovered,
          remainingInventoryCostMinor: newRemainingCost,
        });
        if (invariantError) throw new Error(`Investment ${invId}: ${invariantError}`);

        const fullyRecovered = newRemainingCost === 0;
        const newStatus: InvestmentDoc["status"] = fullyRecovered ? "recovering" : inv.status;
        tx.update(this.db.collection(Collections.investments).doc(invId), {
          recoveredCapitalMinor: newRecovered,
          remainingInventoryCostMinor: newRemainingCost,
          availableProfitMinor: newAvailableProfit,
          status: newStatus,
        });
        // Keep local copy in sync for multi-lot sales hitting same investment.
        investmentSnaps.set(invId, {
          ...inv,
          recoveredCapitalMinor: newRecovered,
          remainingInventoryCostMinor: newRemainingCost,
          availableProfitMinor: newAvailableProfit,
          status: newStatus,
        });

        // ── Ledger: Stream A (capital) ──
        this.writeLedger(tx, {
          type: "capital_recovery",
          stream: "capital",
          investmentId: invId,
          investorId: alloc.data.investorId,
          amountMinor: split.recoveredCapitalMinor,
          previousBalanceMinor: inv.recoveredCapitalMinor,
          newBalanceMinor: newRecovered,
          mlSold: consumption.mlConsumed,
          referenceOrderId: input.orderId,
          referenceOrderItemId: input.orderItemId,
          referenceInventoryId: alloc.id,
          referencePerfumeId: perfumeId,
          performedBy,
          notes: `Capital recovery on ${consumption.mlConsumed} ml sale`,
          idempotencyKey: `${input.orderItemId || `manual-${now.toMillis()}`}_capital_${alloc.id}`,
          createdAt: now,
        });

        // ── Ledger: Stream B (profit) ──
        this.writeLedger(tx, {
          type: "profit_generated",
          stream: "profit",
          investmentId: invId,
          investorId: alloc.data.investorId,
          amountMinor: split.investorProfitMinor,
          previousBalanceMinor: inv.availableProfitMinor,
          newBalanceMinor: newAvailableProfit,
          mlSold: consumption.mlConsumed,
          referenceOrderId: input.orderId,
          referenceOrderItemId: input.orderItemId,
          referenceInventoryId: alloc.id,
          referencePerfumeId: perfumeId,
          performedBy,
          notes: `Investor profit @${inv.profitSharePercentage}% (net ${split.netProfitMinor})`,
          idempotencyKey: `${input.orderItemId || `manual-${now.toMillis()}`}_profit_${alloc.id}`,
          createdAt: now,
        });

        // ── Investor counters ──
        tx.update(this.db.collection(Collections.investors).doc(alloc.data.investorId), {
          totalRecoveredCapitalMinor: FieldValue.increment(split.recoveredCapitalMinor),
          totalProfitMinor: FieldValue.increment(split.investorProfitMinor),
          updatedAt: now,
        });

        result.totalCapitalRecoveredMinor += split.recoveredCapitalMinor;
        result.totalInvestorProfitMinor += split.investorProfitMinor;
        result.totalBusinessProfitMinor += split.businessProfitMinor;
        if (!result.investmentIds.includes(invId)) result.investmentIds.push(invId);
      });
    });

    if (result.processed) {
      await logAudit({
        action: AUDIT_ACTIONS.INVESTMENT_SALE_PROCESSED,
        userId: performedBy,
        userEmail: "",
        userName: "",
        resource: "investmentSale",
        resourceId: input.orderItemId || perfumeId,
        changes: {},
        details: {
          perfumeId,
          ml,
          mlFundedProcessed: result.mlFundedProcessed,
          capitalRecoveredMinor: result.totalCapitalRecoveredMinor,
          investorProfitMinor: result.totalInvestorProfitMinor,
          investments: result.investmentIds,
        },
        status: "success",
      });
    }

    return result;
  }

  /**
   * Record a manual adjustment (the ONLY way to correct ledger history —
   * entries are immutable; this appends a compensating entry and re-syncs
   * the investment balances inside one transaction).
   */
  async recordAdjustment(input: {
    investmentId: string;
    stream: LedgerStream;
    amountMinor: number; // signed
    reason: string;
    performedBy: string;
  }): Promise<void> {
    const { investmentId, stream, amountMinor, reason, performedBy } = input;
    if (!reason.trim()) throw new Error("Adjustment reason is required");
    if (stream !== "capital" && stream !== "profit") {
      throw new Error("Adjustment stream must be capital or profit");
    }
    const invRef = this.db.collection(Collections.investments).doc(investmentId);

    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists) throw new Error("Investment not found");
      const inv = snap.data() as InvestmentDoc;
      const now = Timestamp.now();

      let previous: number;
      let next: number;
      if (stream === "capital") {
        previous = inv.recoveredCapitalMinor;
        next = previous + amountMinor;
        const newRemaining = inv.remainingInventoryCostMinor - amountMinor;
        const err = validateInvariant({
          amountMinor: inv.amountMinor,
          recoveredCapitalMinor: next,
          remainingInventoryCostMinor: newRemaining,
        });
        if (err) throw new Error(err);
        tx.update(invRef, {
          recoveredCapitalMinor: next,
          remainingInventoryCostMinor: newRemaining,
        });
      } else {
        previous = inv.availableProfitMinor;
        next = previous + amountMinor;
        if (next < 0) throw new Error("Adjustment would make available profit negative");
        tx.update(invRef, { availableProfitMinor: next });
      }

      this.writeLedger(tx, {
        type: "adjustment",
        stream,
        investmentId,
        investorId: inv.investorId,
        amountMinor,
        previousBalanceMinor: previous,
        newBalanceMinor: next,
        mlSold: null,
        referenceOrderId: null,
        referenceOrderItemId: null,
        referenceInventoryId: null,
        referencePerfumeId: null,
        performedBy,
        notes: reason,
        // Random suffix: two adjustments in the same millisecond must not collide.
        idempotencyKey: `${investmentId}_adjustment_${now.toMillis()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
      });
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_ADJUSTMENT,
      userId: performedBy,
      userEmail: "",
      userName: "",
      resource: "investment",
      resourceId: investmentId,
      changes: {},
      details: { stream, amountMinor },
      status: "success",
      reason,
    });
  }

  /**
   * Reverse every processed investment sale for a cancelled order.
   * The ledger stays immutable: originals are untouched and compensating
   * `adjustment` entries are appended with deterministic keys
   * (`rev_<original idempotencyKey>` via tx.create), so a second reversal
   * of the same order physically fails — replay/duplicate-event proof.
   * Restores allocation ml, investment balances (invariant re-validated)
   * and investor counters in one transaction.
   */
  async reverseSalesForOrder(input: {
    orderId: string;
    performedBy: string;
    reason: string;
  }): Promise<{ reversedEntries: number; investmentIds: string[] }> {
    const { orderId, performedBy, reason } = input;
    if (!reason.trim()) throw new Error("Reversal reason is required");

    // Find the sale entries for this order (single-field query; type filtered
    // in memory to avoid a composite index).
    const ledgerSnap = await this.db
      .collection(Collections.investmentTransactions)
      .where("referenceOrderId", "==", orderId)
      .get();
    const saleEntries = ledgerSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as LedgerEntryDoc) }))
      .filter((e) => e.type === "capital_recovery" || e.type === "profit_generated");
    if (!saleEntries.length) return { reversedEntries: 0, investmentIds: [] };

    const investmentIds = [...new Set(saleEntries.map((e) => e.investmentId))];
    const allocationIds = [
      ...new Set(saleEntries.map((e) => e.referenceInventoryId).filter((x): x is string => !!x)),
    ];
    const investorIds = [...new Set(saleEntries.map((e) => e.investorId))];

    await this.db.runTransaction(async (tx) => {
      // ── All reads first (Firestore requirement) ──
      const investments = new Map<string, InvestmentDoc>();
      for (const invId of investmentIds) {
        const snap = await tx.get(this.db.collection(Collections.investments).doc(invId));
        if (!snap.exists) throw new Error(`Investment ${invId} missing during reversal`);
        const inv = snap.data() as InvestmentDoc;
        if (inv.status === "bought_back") {
          throw new Error(
            `Investment ${invId} was bought back — reverse manually via adjustments`
          );
        }
        investments.set(invId, inv);
      }
      const allocations = new Map<string, InvestmentAllocationDoc>();
      for (const allocId of allocationIds) {
        const snap = await tx.get(
          this.db.collection(Collections.investmentAllocations).doc(allocId)
        );
        if (!snap.exists) throw new Error(`Allocation ${allocId} missing during reversal`);
        allocations.set(allocId, snap.data() as InvestmentAllocationDoc);
      }

      const now = Timestamp.now();

      // ── Apply per-entry deltas to local copies, write ledger reversals ──
      for (const entry of saleEntries) {
        const inv = investments.get(entry.investmentId)!;
        if (entry.type === "capital_recovery") {
          inv.recoveredCapitalMinor -= entry.amountMinor;
          inv.remainingInventoryCostMinor += entry.amountMinor;
          const alloc = entry.referenceInventoryId
            ? allocations.get(entry.referenceInventoryId)
            : undefined;
          if (alloc && entry.mlSold) {
            alloc.remainingMl += entry.mlSold;
            alloc.soldMl -= entry.mlSold;
            alloc.status = "open";
          }
        } else {
          inv.availableProfitMinor -= entry.amountMinor;
        }

        this.writeLedger(tx, {
          type: "adjustment",
          stream: entry.stream,
          investmentId: entry.investmentId,
          investorId: entry.investorId,
          amountMinor: -entry.amountMinor,
          previousBalanceMinor: entry.newBalanceMinor,
          newBalanceMinor: entry.previousBalanceMinor,
          mlSold: entry.mlSold,
          referenceOrderId: entry.referenceOrderId,
          referenceOrderItemId: entry.referenceOrderItemId,
          referenceInventoryId: entry.referenceInventoryId,
          referencePerfumeId: entry.referencePerfumeId,
          performedBy,
          notes: reason,
          // Deterministic: a second reversal of the same sale fails tx.create.
          idempotencyKey: `rev_${entry.idempotencyKey}`,
          createdAt: now,
        });
      }

      // ── Validate + persist investments ──
      for (const [invId, inv] of investments) {
        const err = validateInvariant({
          amountMinor: inv.amountMinor,
          recoveredCapitalMinor: inv.recoveredCapitalMinor,
          remainingInventoryCostMinor: inv.remainingInventoryCostMinor,
        });
        if (err) throw new Error(`Investment ${invId}: ${err}`);
        const status: InvestmentDoc["status"] =
          inv.remainingInventoryCostMinor > 0 && inv.status === "recovering"
            ? "active"
            : inv.status;
        tx.update(this.db.collection(Collections.investments).doc(invId), {
          recoveredCapitalMinor: inv.recoveredCapitalMinor,
          remainingInventoryCostMinor: inv.remainingInventoryCostMinor,
          availableProfitMinor: inv.availableProfitMinor,
          status,
        });
      }

      // ── Persist allocations ──
      for (const [allocId, alloc] of allocations) {
        if (alloc.remainingMl < 0 || alloc.soldMl < 0) {
          throw new Error(`Allocation ${allocId} would go negative during reversal`);
        }
        tx.update(this.db.collection(Collections.investmentAllocations).doc(allocId), {
          remainingMl: alloc.remainingMl,
          soldMl: alloc.soldMl,
          status: alloc.status,
        });
      }

      // ── Investor counters ──
      for (const investorId of investorIds) {
        const capitalDelta = saleEntries
          .filter((e) => e.investorId === investorId && e.type === "capital_recovery")
          .reduce((s, e) => s + e.amountMinor, 0);
        const profitDelta = saleEntries
          .filter((e) => e.investorId === investorId && e.type === "profit_generated")
          .reduce((s, e) => s + e.amountMinor, 0);
        tx.update(this.db.collection(Collections.investors).doc(investorId), {
          totalRecoveredCapitalMinor: FieldValue.increment(-capitalDelta),
          totalProfitMinor: FieldValue.increment(-profitDelta),
          updatedAt: now,
        });
      }
    });

    await logAudit({
      action: AUDIT_ACTIONS.INVESTMENT_SALE_REVERSED,
      userId: performedBy,
      userEmail: "",
      userName: "",
      resource: "investmentSale",
      resourceId: orderId,
      changes: {},
      details: { orderId, reversedEntries: saleEntries.length, investments: investmentIds },
      status: "success",
      reason,
    });

    return { reversedEntries: saleEntries.length, investmentIds };
  }

  /** Write an immutable ledger entry with create-only semantics. */
  private writeLedger(
    tx: FirebaseFirestore.Transaction,
    entry: Omit<LedgerEntryDoc, "id"> & { type: LedgerEntryType }
  ): void {
    // .create() (not .set()) — fails if the idempotency key already exists.
    tx.create(ledgerRef(this.db, entry.idempotencyKey), entry);
  }
}

export const investmentAccounting = new InvestmentAccountingService();
