/**
 * Admin Payment Type taxonomy.
 *
 * `paymentType` is an admin-facing categorization stored on the order document.
 * It is independent from the customer-facing `paymentMethod` field (which controls
 * payment workflow — e.g. "Bkash Manual" vs "Cash on Delivery"). When a legacy
 * order has no `paymentType`, callers must default the display to "COD" via
 * `order.paymentType ?? "COD"`.
 */

export const PAYMENT_TYPES = [
  "COD",
  "bKash",
  "Nagad",
  "Rocket",
  "Bank Transfer",
  "SSLCommerz",
  "Other",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const DEFAULT_PAYMENT_TYPE: PaymentType = "COD";

const PAYMENT_TYPE_SET = new Set<string>(PAYMENT_TYPES);

/** Narrow an arbitrary value to a valid PaymentType, falling back to "COD". */
export function normalizePaymentType(value: unknown): PaymentType {
  if (typeof value === "string" && PAYMENT_TYPE_SET.has(value)) {
    return value as PaymentType;
  }
  return DEFAULT_PAYMENT_TYPE;
}

/**
 * Infer a default `paymentType` from the legacy `paymentMethod` workflow field.
 * Used only to render legacy orders (where `paymentType` is undefined) — never
 * to write a value back to Firestore implicitly.
 */
export function inferPaymentTypeFromMethod(method: string | undefined | null): PaymentType {
  switch ((method || "").trim()) {
    case "Bkash Manual":
      return "bKash";
    case "Bank Manual":
      return "Bank Transfer";
    case "Cash on Delivery":
      return "COD";
    default:
      return DEFAULT_PAYMENT_TYPE;
  }
}
