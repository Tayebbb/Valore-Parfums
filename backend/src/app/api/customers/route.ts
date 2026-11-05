import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCustomers } from "@/lib/customer-repository";
import { customerEmailSetupError } from "@/lib/customer-message";
import { isEmailConfigured } from "@/lib/email";

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const customers = await getCustomers();
    const setupError = !isEmailConfigured()
      ? "Configure Resend or Gmail on the backend to send customer emails."
      : customerEmailSetupError();
    return NextResponse.json(
      { customers, canSend: !setupError, setupError },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Customer directory failed", error);
    return NextResponse.json(
      { error: "Could not load customers. Please try again." },
      { status: 500 },
    );
  }
}
