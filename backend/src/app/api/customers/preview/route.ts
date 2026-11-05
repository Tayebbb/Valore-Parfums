import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CustomerRequestError, readCustomerJson } from "@/lib/customer-request";
import {
  generateCustomerMessage,
  parseCustomerMessage,
} from "@/lib/customer-message";

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const message = parseCustomerMessage(await readCustomerJson(req));
    return NextResponse.json({
      html: generateCustomerMessage(message, "preview@example.com", true).html,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid message." },
      { status: error instanceof CustomerRequestError ? error.status : 400 },
    );
  }
}
