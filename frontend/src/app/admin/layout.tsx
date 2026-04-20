"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FlaskConical,
  Wine,
  Settings,
  ShoppingCart,
  Tag,
  FileText,
  BarChart3,
  Bell,
  MapPin,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/brand-sections", label: "Brand Sections", icon: Tag },
  { href: "/admin/decant-sizes", label: "Decant Sizes", icon: FlaskConical },
  { href: "/admin/bottles", label: "Bottles", icon: Wine },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/vouchers", label: "Vouchers", icon: Tag },
  { href: "/admin/pickup-locations", label: "Pickup Locations", icon: MapPin },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/export", label: "Export", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 border-b border-[var(--border)] bg-[var(--bg-base)]/95 backdrop-blur-md">
        <div className="h-full px-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={mobileNavOpen ? "Close admin menu" : "Open admin menu"}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href="/admin" className="font-serif text-lg font-light tracking-wide text-[var(--gold)]">
            Valore Admin
          </Link>
          <div className="w-9" aria-hidden="true" />
        </div>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 top-14 z-30 bg-black/50"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] md:w-64 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col transform transition-transform duration-200 md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-[var(--border)]">
          <Link href="/admin" className="block">
            <h1 className="font-serif text-2xl font-light tracking-wide text-[var(--gold)]">
              Valore
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)] mt-0.5">
              Admin Panel
            </p>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors border-l-2 ${
                  active
                    ? "border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--gold-tint)]"
                }`}
              >
                <Icon size={18} />
                <span className="uppercase tracking-wider text-xs">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)]">
          <Link
            href="/"
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors"
          >
            ← View Store
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-h-screen flex-1 md:ml-64">
        <div className="p-4 sm:p-6 md:p-8 pt-16 md:pt-8">{children}</div>
      </main>
    </div>
  );
}
