import { toMinorUnits } from "./finance";

export interface PaymentReceipt {
  id: string;
  ownerId: "owner1" | "owner2" | null;
  amountMinor: number;
  sequence: number;
  revision: number;
  updatedAt?: unknown;
}

export interface PaymentCustodyState {
  sequence: number;
  transferredThrough: number;
}

// Track cash actually collected, independently of dashboard revenue. Prepaid
// delivery money is received in full; COD remittances have courier fees removed.
export function orderCashAmountMinor(order: {
  total?: number;
  deliveryFee?: number;
  paymentMethod?: string;
  paymentType?: string;
  financialsMinor?: { totalMinor?: number; deliveryFeeMinor?: number };
}): number {
  const total = Number(order.financialsMinor?.totalMinor ?? toMinorUnits(Number(order.total ?? 0)));
  const delivery = Number(order.financialsMinor?.deliveryFeeMinor ?? toMinorUnits(Number(order.deliveryFee ?? 0)));
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(delivery)) return 0;
  const isCod = order.paymentType ? order.paymentType === "COD"
    : !order.paymentMethod || order.paymentMethod === "Cash on Delivery";
  return Math.max(0, total - (isCod ? delivery : 0));
}

export function currentPaymentHolder(receipt: PaymentReceipt, state: PaymentCustodyState): PaymentReceipt["ownerId"] {
  return receipt.ownerId === "owner2" && receipt.sequence <= state.transferredThrough
    ? "owner1" : receipt.ownerId;
}

export function enidHeldMinor(receipts: PaymentReceipt[], state: PaymentCustodyState): number {
  return receipts.reduce((sum, receipt) => sum + (
    receipt.ownerId === "owner2" && receipt.sequence > state.transferredThrough ? receipt.amountMinor : 0
  ), 0);
}
