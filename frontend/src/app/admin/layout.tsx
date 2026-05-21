import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminSidebar from "./_AdminSidebar";

// Server component — auth check happens on the server by reading the session
// cookie directly. No backend round-trip, no client-side race conditions.
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
