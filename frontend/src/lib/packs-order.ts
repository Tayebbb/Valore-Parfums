/**
 * Presentation helpers for orders that contain Perfume Packs.
 *
 * Packs are stored as ordinary per-perfume order items sharing a `packGroupId` (so stock, owner
 * profit and cancellation work per perfume). UIs group them back into one pack line using THE
 * ORDER'S OWN SNAPSHOT data — never the live pack document, which may have been edited or deleted.
 */
import type { PackDiscountType, PackOrderSnapshot } from "@/types/pack";
import { packDiscountLabel } from "@/types/pack";

export interface OrderItemPackFields {
  itemType?: string;
  packId?: string;
  packName?: string;
  packGroupId?: string;
  packQuantity?: number;
  packDecantSizeMl?: number;
  /** Whole purchased pack line (× quantity); identical on every component of the group. */
  packOriginalSubtotal?: number;
  packDiscountType?: PackDiscountType;
  packDiscountValue?: number;
  packDiscountAmount?: number;
  packFinalPrice?: number;
}

export interface GroupablePerfumeItem extends OrderItemPackFields {
  perfumeName: string;
  ml: number;
  quantity: number;
  totalPrice?: number;
}

export interface PackGroup<T> {
  kind: "pack";
  groupId: string;
  packId: string;
  name: string;
  quantity: number;
  ml: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  discountType: PackDiscountType;
  discountValue: number;
  discountLabel: string;
  components: T[];
}

export type OrderLine<T> = { kind: "item"; item: T } | PackGroup<T>;

/**
 * Collapse pack components into one line per purchased pack (first-appearance order); ordinary
 * items pass through unchanged. Falls back to the item docs themselves when an old/odd order has
 * no `packs` snapshot, and prefers the order snapshot (immutable) when it exists.
 */
export function groupOrderItems<T extends GroupablePerfumeItem>(items: T[] | undefined, snapshots?: PackOrderSnapshot[]): OrderLine<T>[] {
  const lines: OrderLine<T>[] = [];
  const groups = new Map<string, PackGroup<T>>();
  const snapshotById = new Map((snapshots || []).map((s) => [s.packGroupId, s]));

  for (const item of items || []) {
    const groupId = item.packGroupId;
    if (!groupId) {
      lines.push({ kind: "item", item });
      continue;
    }
    let group = groups.get(groupId);
    if (!group) {
      const snap = snapshotById.get(groupId);
      const type = (snap?.discountType ?? item.packDiscountType ?? "percentage") as PackDiscountType;
      const value = Number(snap?.discountValue ?? item.packDiscountValue ?? 0);
      group = {
        kind: "pack",
        groupId,
        packId: snap?.packId ?? item.packId ?? "",
        name: snap?.packName ?? item.packName ?? "Perfume Pack",
        quantity: Number(snap?.quantity ?? item.packQuantity ?? item.quantity ?? 1),
        ml: Number(snap?.decantSizeMl ?? item.packDecantSizeMl ?? item.ml ?? 0),
        originalTotal: Number(snap?.originalTotal ?? item.packOriginalSubtotal ?? 0),
        discountTotal: Number(snap?.discountTotal ?? item.packDiscountAmount ?? 0),
        finalTotal: Number(snap?.finalTotal ?? item.packFinalPrice ?? 0),
        discountType: type,
        discountValue: value,
        discountLabel: packDiscountLabel(type, value),
        components: [],
      };
      groups.set(groupId, group);
      lines.push(group);
    }
    group.components.push(item);
  }
  return lines;
}

/** Number of order lines as a customer would count them (a pack is ONE line). */
export function countOrderLines(items: GroupablePerfumeItem[] | undefined): number {
  return groupOrderItems(items).length;
}

/** Compact one-line description used by admin list rows. */
export function describeOrderLines<T extends GroupablePerfumeItem & { isFullBottle?: boolean; fullBottleSize?: string }>(
  items: T[] | undefined,
  snapshots?: PackOrderSnapshot[],
): string {
  const lines = groupOrderItems(items, snapshots).map((line) =>
    line.kind === "pack"
      ? `${line.name} ×${line.quantity} [${line.components.map((c) => c.perfumeName).join(", ")} ${line.ml}ml]`
      : `${line.item.perfumeName} ${line.item.isFullBottle ? `Full Bottle (${line.item.fullBottleSize || "Custom"})` : `${line.item.ml}ml`}×${line.item.quantity}`,
  );
  return lines.join(", ") || "-";
}
