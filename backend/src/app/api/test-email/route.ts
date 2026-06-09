import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || admin.email || "").trim();

  if (!to) {
    return NextResponse.json({ error: "No recipient email found" }, { status: 400 });
  }

  const result = await sendEmail({
    to,
    subject: "Valore Parfums — Email Test",
    html: `<p style="font-family:sans-serif;">This is a test email sent at ${new Date().toISOString()} to confirm the email provider is working correctly.</p>`,
    text: `Email provider test sent at ${new Date().toISOString()}`,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageId: result.messageId, to });
}
