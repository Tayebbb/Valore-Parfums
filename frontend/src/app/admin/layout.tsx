import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser, COOKIE_NAME } from "@/lib/auth";
import AdminSidebar from "./_AdminSidebar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Server component — auth check happens on the server by reading the session
// cookie directly. No backend round-trip, no client-side race conditions.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Diagnostic logging visible in Vercel function logs.
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  console.log("[admin-layout] cookie present?", Boolean(raw), "len:", raw?.length ?? 0);

  const user = await getSessionUser();
  console.log(
    "[admin-layout] resolved user:",
    user ? { id: user.id, role: user.role, email: user.email } : null,
  );

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (user.role !== "admin") {
    redirect("/");
  }

  return <AdminSidebar>{children}</AdminSidebar>;
}
