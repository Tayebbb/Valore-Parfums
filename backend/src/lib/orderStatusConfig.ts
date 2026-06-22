// Shared configuration for Order Statuses and Tracking Progress

export type FulfillmentType = "Pickup" | "Delivery";

export type EmailTemplateKey =
  | "orderPlaced"
  | "orderConfirmed"
  | "orderPaid"
  | "readyForPickup"
  | "outForDelivery"
  | "completed"
  | "cancelled";

export type OrderStatusKey =
  | "order_placed"
  | "pending_bkash_verification"
  | "pending_bank_verification"
  | "processing"
  | "paid"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

export interface StatusDefinition {
  label: string;
  uiLabel: string;
  adminLabel: string;
  emailTemplate?: EmailTemplateKey;
  fulfillmentTypes?: FulfillmentType[];
  dbValues: string[];
}

export const STATUS_CONFIG: Record<OrderStatusKey, StatusDefinition> = {
  order_placed: {
    label: "Order Placed",
    uiLabel: "Pending",
    adminLabel: "Pending",
    emailTemplate: "orderPlaced",
    dbValues: ["Pending"],
  },
  pending_bkash_verification: {
    label: "Pending Bkash Verification",
    uiLabel: "Pending bKash Verification",
    adminLabel: "Pending Bkash Verification",
    dbValues: ["Pending Bkash Verification"],
  },
  pending_bank_verification: {
    label: "Pending Bank Verification",
    uiLabel: "Pending Bank Verification",
    adminLabel: "Pending Bank Verification",
    dbValues: ["Pending Bank Verification"],
  },
  processing: {
    label: "Processing",
    uiLabel: "Processing",
    adminLabel: "Processing",
    emailTemplate: "orderConfirmed",
    dbValues: ["Confirmed"],
  },
  paid: {
    label: "Paid",
    uiLabel: "Paid",
    adminLabel: "Paid",
    emailTemplate: "orderPaid",
    dbValues: ["Paid"],
  },
  ready_for_pickup: {
    label: "Ready for Pickup",
    uiLabel: "Ready for Pickup",
    adminLabel: "Ready for Pickup",
    emailTemplate: "readyForPickup",
    fulfillmentTypes: ["Pickup"],
    dbValues: ["Ready for Pickup"],
  },
  out_for_delivery: {
    label: "Out for Delivery",
    uiLabel: "Out for Delivery",
    adminLabel: "Out for Delivery",
    emailTemplate: "outForDelivery",
    fulfillmentTypes: ["Delivery"],
    dbValues: ["Out for Delivery", "Shipped"],
  },
  completed: {
    label: "Completed",
    uiLabel: "Completed",
    adminLabel: "Completed",
    emailTemplate: "completed",
    dbValues: ["Dispatched", "Delivered", "Completed", "Fulfilled"],
  },
  cancelled: {
    label: "Cancelled",
    uiLabel: "Cancelled",
    adminLabel: "Cancelled",
    emailTemplate: "cancelled",
    dbValues: ["Cancelled", "Declined"],
  },
};

export const PROGRESS_STEPS = {
  delivery: ["order_placed", "processing", "out_for_delivery", "completed"],
  pickup: ["order_placed", "processing", "ready_for_pickup", "completed"],
} satisfies Record<"delivery" | "pickup", OrderStatusKey[]>;

export const ADMIN_STATUS_ORDER: OrderStatusKey[] = [
  "order_placed",
  "pending_bkash_verification",
  "pending_bank_verification",
  "processing",
  "paid",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
];

const STATUS_ALIAS_MAP: Record<string, OrderStatusKey> = {
  "order placed": "order_placed",
  order_placed: "order_placed",
  pending: "order_placed",
  "pending bkash verification": "pending_bkash_verification",
  pending_bkash_verification: "pending_bkash_verification",
  "bkash verification": "pending_bkash_verification",
  "pending bank verification": "pending_bank_verification",
  pending_bank_verification: "pending_bank_verification",
  "bank verification": "pending_bank_verification",
  processing: "processing",
  confirmed: "processing",
  approved: "processing",
  sourcing: "processing",
  paid: "paid",
  "bkash paid": "paid",
  "ready for pickup": "ready_for_pickup",
  ready_for_pickup: "ready_for_pickup",
  "out for delivery": "out_for_delivery",
  out_for_delivery: "out_for_delivery",
  shipped: "out_for_delivery",
  dispatched: "completed",
  delivered: "completed",
  completed: "completed",
  fulfilled: "completed",
  cancelled: "cancelled",
  declined: "cancelled",
};

const DB_VALUE_LOOKUP = new Map<string, OrderStatusKey>();
Object.entries(STATUS_CONFIG).forEach(([key, def]) => {
  def.dbValues.forEach((value) => {
    DB_VALUE_LOOKUP.set(value.toLowerCase(), key as OrderStatusKey);
  });
});

export const ADMIN_STATUS_MAP: Record<string, string> = Object.fromEntries(
  ADMIN_STATUS_ORDER.map((key) => [STATUS_CONFIG[key].adminLabel, STATUS_CONFIG[key].dbValues[0]]),
);

export function normalizePickupMethod(pickupMethod?: string): FulfillmentType {
  const normalized = String(pickupMethod || "").trim().toLowerCase();
  if (normalized.includes("pickup")) return "Pickup";
  return "Delivery";
}

export function resolveStatusKey(status?: string, pickupMethod?: string): OrderStatusKey | null {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "ready") {
    return normalizePickupMethod(pickupMethod) === "Pickup" ? "ready_for_pickup" : "out_for_delivery";
  }

  const aliasMatch = STATUS_ALIAS_MAP[normalized];
  if (aliasMatch) return aliasMatch;

  return DB_VALUE_LOOKUP.get(normalized) ?? null;
}

export function normalizeOrderStatus(status?: string, pickupMethod?: string): string {
  const statusKey = resolveStatusKey(status, pickupMethod) ?? "order_placed";
  return STATUS_CONFIG[statusKey].dbValues[0];
}

export function normalizeOrderStatusKey(status?: string, pickupMethod?: string): OrderStatusKey {
  return resolveStatusKey(status, pickupMethod) ?? "order_placed";
}

export function getStatusLabel(statusKey: OrderStatusKey, variant: "label" | "ui" | "admin" = "label"): string {
  const def = STATUS_CONFIG[statusKey];
  if (variant === "admin") return def.adminLabel;
  if (variant === "ui") return def.uiLabel;
  return def.label;
}

export function getStatusLabelFromValue(
  status?: string,
  pickupMethod?: string,
  variant: "label" | "ui" | "admin" = "label",
): string {
  const key = normalizeOrderStatusKey(status, pickupMethod);
  return getStatusLabel(key, variant);
}

export function getDbValueForStatusKey(statusKey: OrderStatusKey): string {
  return STATUS_CONFIG[statusKey].dbValues[0];
}

export function isStatusAllowedForFulfillment(statusKey: OrderStatusKey, pickupMethod?: string): boolean {
  const types = STATUS_CONFIG[statusKey].fulfillmentTypes;
  if (!types || types.length === 0) return true;
  const fulfillment = normalizePickupMethod(pickupMethod);
  return types.includes(fulfillment);
}

export function isTerminalStatus(status?: string, pickupMethod?: string): boolean {
  const key = normalizeOrderStatusKey(status, pickupMethod);
  return key === "completed" || key === "cancelled";
}

export function isValidTransition(fromStatus: string, toStatus: string, pickupMethod?: string): boolean {
  const fromKey = resolveStatusKey(fromStatus, pickupMethod);
  const toKey = resolveStatusKey(toStatus, pickupMethod);

  if (!fromKey || !toKey) return false;
  if (fromKey === toKey) return true;
  if (fromKey === "cancelled") return false;
  if (fromKey === "completed") return toKey === "cancelled";
  return true;
}

export function getProgressStepKeys(pickupMethod?: string, paymentMethod?: string): OrderStatusKey[] {
  const isPickup = normalizePickupMethod(pickupMethod) === "Pickup";
  const baseSteps = isPickup ? PROGRESS_STEPS.pickup : PROGRESS_STEPS.delivery;

  if (paymentMethod === "Bkash Manual") {
    return ["pending_bkash_verification", "processing", baseSteps[2], "completed"];
  }
  if (paymentMethod === "Bank Manual") {
    return ["pending_bank_verification", "paid", baseSteps[2], "completed"];
  }
  return baseSteps;
}

export function getProgressSteps(pickupMethod?: string, paymentMethod?: string): string[] {
  return getProgressStepKeys(pickupMethod, paymentMethod).map((key) => STATUS_CONFIG[key].uiLabel);
}

export function mapDbStatusToTrackStep(
  dbStatus: string,
  pickupMethod?: string,
  paymentMethod?: string,
): string {
  const statusKey = normalizeOrderStatusKey(dbStatus, pickupMethod);
  const stepKeys = getProgressStepKeys(pickupMethod, paymentMethod);

  if (stepKeys.includes(statusKey)) {
    return STATUS_CONFIG[statusKey].uiLabel;
  }
  if (statusKey === "completed") return STATUS_CONFIG.completed.uiLabel;
  if (statusKey === "cancelled") return STATUS_CONFIG.cancelled.uiLabel;
  if (statusKey === "processing" || statusKey === "paid") return STATUS_CONFIG[statusKey].uiLabel;
  if (statusKey === "ready_for_pickup" || statusKey === "out_for_delivery") {
    return STATUS_CONFIG[statusKey].uiLabel;
  }
  if (statusKey === "pending_bkash_verification") return STATUS_CONFIG.pending_bkash_verification.uiLabel;
  if (statusKey === "pending_bank_verification") return STATUS_CONFIG.pending_bank_verification.uiLabel;
  return STATUS_CONFIG.order_placed.uiLabel;
}
