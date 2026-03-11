"use client";

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
  Inbox,
  Bell,
  MapPin,
  MessageSquare,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/decant-sizes", label: "Decant Sizes", icon: FlaskConical },
  { href: "/admin/bottles", label: "Bottles", icon: Wine },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/vouchers", label: "Vouchers", icon: Tag },
  { href: "/admin/stock-requests", label: "Stock Requests", icon: Inbox },
  { href: "/admin/requests", label: "Requests", icon: MessageSquare },
  { href: "/admin/pickup-locations", label: "Pickup Locations", icon: MapPin },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/export", label: "Export", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col fixed h-full z-40">
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
      <main className="ml-64 flex-1 min-h-screen">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
