import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

// Server-side gate: mirrors admin/layout.tsx. Only investors (or admins,
// who may view their own linked profile) can enter /investor. The API
// additionally resolves the investor from the session — this layout is
// UX, not the security boundary.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/investor");
  if (user.role !== "investor" && user.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-light tracking-wide text-[var(--gold)]">Valore</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Investor Portal</p>
          </div>
          <Link href="/" className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
            ← Back to store
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6">{children}</main>
    </div>
  );
}
