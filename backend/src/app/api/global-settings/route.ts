import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getGlobalSettings,
  updatePickupSettings,
  updateCancellationReasons,
  type PickupSettings,
} from "@/lib/services/adminSettings";

// GET — fetch global operational settings (admin only)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getGlobalSettings();
  return NextResponse.json(settings);
}

// PUT — update global operational settings (admin only)
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { pickup, cancellation } = body as {
    pickup?: Partial<PickupSettings>;
    cancellation?: { presetReasons?: string[] };
  };

  const errors: string[] = [];

  if (pickup !== undefined) {
    if (typeof pickup.enabled !== "undefined" && typeof pickup.enabled !== "boolean") {
      errors.push("pickup.enabled must be a boolean");
    }

    const willBeEnabled = typeof pickup.enabled === "boolean" ? pickup.enabled : undefined;
    const current = await getGlobalSettings();
    const effectiveEnabled = willBeEnabled !== undefined ? willBeEnabled : current.pickup.enabled;

    const contactNumber = String(pickup.contactNumber ?? current.pickup.contactNumber ?? "").trim();
    const estimatedPrepTime = String(pickup.estimatedPrepTime ?? current.pickup.estimatedPrepTime ?? "").trim();

    if (effectiveEnabled) {
      if (!contactNumber) errors.push("contactNumber is required when pickup is enabled");
      if (!estimatedPrepTime) errors.push("estimatedPrepTime is required when pickup is enabled");
    }

    if (pickup.availableFrom) {
      const d = new Date(pickup.availableFrom);
      if (isNaN(d.getTime())) {
        errors.push("availableFrom must be a valid date");
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    await updatePickupSettings(pickup);
  }

  if (cancellation !== undefined) {
    if (!Array.isArray(cancellation.presetReasons)) {
      return NextResponse.json({ error: "cancellation.presetReasons must be an array" }, { status: 400 });
    }
    if (cancellation.presetReasons.length < 1) {
      return NextResponse.json({ error: "At least one cancellation reason is required" }, { status: 400 });
    }
    await updateCancellationReasons(cancellation.presetReasons);
  }

  const updated = await getGlobalSettings();
  return NextResponse.json(updated);
}
