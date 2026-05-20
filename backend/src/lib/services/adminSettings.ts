/**
 * Centralized admin settings service for `settings/globalOperationalSettings` Firestore doc.
 *
 * Schema:
 * {
 *   pickup: {
 *     enabled: boolean,
 *     availableFrom: string | null,   // ISO date string (future date) or null
 *     contactNumber: string,          // required when enabled
 *     estimatedPrepTime: string,      // required when enabled, e.g. "30–45 minutes"
 *   },
 *   cancellation: {
 *     presetReasons: string[],        // ordered list of dropdown options
 *   },
 *   updatedAt: Timestamp | null,
 * }
 */

import { db, Collections } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const GLOBAL_SETTINGS_DOC = "globalOperationalSettings";

export const DEFAULT_CANCELLATION_REASONS = [
  "Out of Stock",
  "Supplier Delay",
  "Product Damaged",
  "Pricing Error",
  "Payment Verification Failed",
  "Duplicate Order",
  "Customer Request",
  "Delivery Area Unavailable",
  "Technical Issue",
  "Other",
] as const;

export interface PickupSettings {
  enabled: boolean;
  availableFrom: string | null;
  contactNumber: string;
  estimatedPrepTime: string;
}

export interface CancellationSettings {
  presetReasons: string[];
}

export interface GlobalOperationalSettings {
  pickup: PickupSettings;
  cancellation: CancellationSettings;
  updatedAt: string | null;
}

const defaultPickup: PickupSettings = {
  enabled: true,
  availableFrom: null,
  contactNumber: "",
  estimatedPrepTime: "",
};

const defaultCancellation: CancellationSettings = {
  presetReasons: [...DEFAULT_CANCELLATION_REASONS],
};

export async function getGlobalSettings(): Promise<GlobalOperationalSettings> {
  const doc = await db.collection(Collections.settings).doc(GLOBAL_SETTINGS_DOC).get();

  if (!doc.exists) {
    return {
      pickup: { ...defaultPickup },
      cancellation: { ...defaultCancellation },
      updatedAt: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = doc.data() as any;

  const pickup: PickupSettings = {
    enabled: typeof data.pickup?.enabled === "boolean" ? data.pickup.enabled : true,
    availableFrom: data.pickup?.availableFrom ? String(data.pickup.availableFrom) : null,
    contactNumber: String(data.pickup?.contactNumber || ""),
    estimatedPrepTime: String(data.pickup?.estimatedPrepTime || ""),
  };

  const presetReasons = Array.isArray(data.cancellation?.presetReasons)
    ? (data.cancellation.presetReasons as unknown[]).map(String).filter(Boolean)
    : [...DEFAULT_CANCELLATION_REASONS];

  const cancellation: CancellationSettings = { presetReasons };

  const updatedAt = data.updatedAt?.toDate
    ? (data.updatedAt as Timestamp).toDate().toISOString()
    : data.updatedAt
      ? String(data.updatedAt)
      : null;

  return { pickup, cancellation, updatedAt };
}

export async function updatePickupSettings(data: Partial<PickupSettings>): Promise<PickupSettings> {
  const current = await getGlobalSettings();
  const updated: PickupSettings = {
    ...current.pickup,
    ...data,
    contactNumber: String(data.contactNumber ?? current.pickup.contactNumber).trim(),
    estimatedPrepTime: String(data.estimatedPrepTime ?? current.pickup.estimatedPrepTime).trim(),
    availableFrom: data.availableFrom !== undefined
      ? (data.availableFrom ? String(data.availableFrom).trim() : null)
      : current.pickup.availableFrom,
  };

  await db.collection(Collections.settings).doc(GLOBAL_SETTINGS_DOC).set(
    { pickup: updated, updatedAt: Timestamp.now() },
    { merge: true },
  );

  return updated;
}

export async function updateCancellationReasons(reasons: string[]): Promise<CancellationSettings> {
  const sanitized = reasons.map(String).map((r) => r.trim()).filter(Boolean);

  await db.collection(Collections.settings).doc(GLOBAL_SETTINGS_DOC).set(
    { cancellation: { presetReasons: sanitized }, updatedAt: Timestamp.now() },
    { merge: true },
  );

  return { presetReasons: sanitized };
}
