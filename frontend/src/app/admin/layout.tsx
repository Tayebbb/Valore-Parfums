import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminSidebar from "./_AdminSidebar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Server component — auth check happens on the server by reading the session
// cookie directly. The proxy in src/proxy.ts also gates /admin, so by the
// time we reach here the user already has a valid signed session cookie.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (user.role !== "admin") {
    redirect("/");
  }

  return <AdminSidebar>{children}</AdminSidebar>;
}
