// ─── Inventory Investment System — shared types ───────
// All monetary values are BDT minor units (poisha) unless suffixed otherwise.
// See backend/src/lib/finance.ts for toMinorUnits / fromMinorUnits.

import type { Timestamp } from "firebase-admin/firestore";

export type MoneyMinor = number;

// ─── Investor ──────────────────────────────────────────
export type InvestorStatus = "active" | "inactive";

export interface InvestorDoc {
  id?: string;
  name: string;
  email: string; // normalized lowercase
  phone: string;
  /** Optional link to a `users` doc (role "investor") for dashboard login */
  userId: string | null;
  status: InvestorStatus;
  notes: string;
  // Denormalized totals (ledger is the source of truth; see check-investments.ts)
  totalInvestedMinor: MoneyMinor;
  totalRecoveredCapitalMinor: MoneyMinor;
  totalProfitMinor: MoneyMinor;
  totalWithdrawnMinor: MoneyMinor;
  activeInvestmentCount: number;
  completedInvestmentCount: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ─── Investment ────────────────────────────────────────
export type InvestmentStatus =
  | "active" // capital deployed, inventory selling
  | "recovering" // capital fully recovered, inventory still selling (profit-only)
  | "closed" // all funded inventory sold
  | "bought_back"; // store repurchased remaining inventory

export interface InvestmentDoc {
  id?: string;
  investorId: string;
  investorName: string; // denormalized for lists
  /** Original invested capital. Immutable after creation. */
  amountMinor: MoneyMinor;
  /** Cost basis of unsold funded inventory. INVARIANT: amount = recovered + remaining. */
  remainingInventoryCostMinor: MoneyMinor;
  recoveredCapitalMinor: MoneyMinor;
  /** Investor profit earned minus withdrawn. Only this is withdrawable. */
  availableProfitMinor: MoneyMinor;
  withdrawnProfitMinor: MoneyMinor;
  profitSharePercentage: number; // investor's share of net profit (0–100)
  status: InvestmentStatus;
  currency: "BDT";
  createdAt: Timestamp | Date;
  closedAt: Timestamp | Date | null;
  buybackAt: Timestamp | Date | null;
  metadata: Record<string, unknown>;
}

// ─── Allocation (inventory lot funded by an investment) ─
export type AllocationStatus = "open" | "depleted" | "bought_back";

export interface InvestmentAllocationDoc {
  id?: string;
  investmentId: string;
  investorId: string;
  perfumeId: string;
  perfumeName: string; // denormalized for reports
  fundedMl: number;
  remainingMl: number;
  soldMl: number;
  /** Capital basis per ml, locked at funding time. */
  costPerMlMinor: MoneyMinor;
  status: AllocationStatus;
  createdAt: Timestamp | Date;
}

// ─── Immutable ledger ──────────────────────────────────
// Entries are NEVER edited or deleted. Corrections are `adjustment` entries.
export type LedgerEntryType =
  | "investment_created"
  | "inventory_purchased"
  | "capital_recovery"
  | "profit_generated"
  | "profit_withdrawal"
  | "buyback"
  | "adjustment"
  | "investment_closed";

/** Stream A = capital recovery, Stream B = profit. NEVER mixed in one entry. */
export type LedgerStream = "capital" | "profit" | "none";

export interface LedgerEntryDoc {
  id?: string;
  type: LedgerEntryType;
  stream: LedgerStream;
  investmentId: string;
  investorId: string;
  referenceOrderId: string | null;
  referenceOrderItemId: string | null;
  referenceInventoryId: string | null; // allocation (lot) id
  referencePerfumeId: string | null;
  amountMinor: MoneyMinor; // signed: positive = credit to the stream's balance
  mlSold: number | null;
  /** Balance of the entry's stream on the investment, before/after this entry. */
  previousBalanceMinor: MoneyMinor;
  newBalanceMinor: MoneyMinor;
  performedBy: string; // user id or "system"
  notes: string;
  /** Deterministic key; doc id = idempotencyKey to make replays impossible. */
  idempotencyKey: string;
  createdAt: Timestamp | Date;
}

// ─── Withdrawal requests (approval workflow) ───────────
export type WithdrawalRequestStatus = "pending" | "approved" | "rejected" | "paid";

export interface InvestmentWithdrawalDoc {
  id?: string;
  investmentId: string;
  investorId: string;
  amountMinor: MoneyMinor;
  status: WithdrawalRequestStatus;
  paymentSource: "Bkash" | "Bank" | "Cash";
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: Timestamp | Date | null;
  rejectReason: string;
  notes: string;
  createdAt: Timestamp | Date;
}

// ─── Buyback record ────────────────────────────────────
export interface BuybackDoc {
  id?: string;
  investmentId: string;
  investorId: string;
  remainingInventoryCostMinor: MoneyMinor;
  availableProfitMinor: MoneyMinor;
  totalAmountMinor: MoneyMinor; // remaining inventory cost + available profit
  returnedMlByAllocation: Array<{ allocationId: string; perfumeId: string; ml: number }>;
  performedBy: string;
  notes: string;
  createdAt: Timestamp | Date;
}

// ─── Sale processing inputs/outputs (pure engine) ──────
export interface SaleAllocationInput {
  allocationId: string;
  remainingMl: number;
  costPerMlMinor: MoneyMinor;
}

export interface SaleAllocationResult {
  allocationId: string;
  mlConsumed: number;
  capitalMinor: MoneyMinor; // mlConsumed × costPerMlMinor (remainder-corrected)
}

export interface SaleSplitInput {
  /** Revenue for the sold quantity, excluding delivery fee. */
  sellingPriceMinor: MoneyMinor;
  /** Packaging + bottle/atomizer/label/pouch costs for the sold quantity. */
  sellingCostsMinor: MoneyMinor;
  /** Capital consumed (perfume cost at lot basis). */
  perfumeCostMinor: MoneyMinor;
  /** Investor's share of net profit, 0–100. */
  investorSharePercent: number;
}

export interface SaleSplitResult {
  recoveredCapitalMinor: MoneyMinor;
  netProfitMinor: MoneyMinor;
  investorProfitMinor: MoneyMinor;
  businessProfitMinor: MoneyMinor;
}
