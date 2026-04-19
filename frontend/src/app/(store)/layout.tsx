"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag, Search, Heart, Sun, Moon, User, ChevronDown, X, Menu, LogOut } from "lucide-react";
import { useCart } from "@/store/cart";
import { useTheme } from "@/store/theme";
import { useAuth } from "@/store/auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { buildCanonicalProductPath } from "@/lib/product-path";

const ANNOUNCEMENTS_CACHE_KEY = "vp-announcements";
const ANNOUNCEMENTS_CACHE_TTL = 60_000;

const shopDropdown = [
  { label: "For Him", href: "/shop?category=Men" },
  { label: "For Her", href: "/shop?category=Women" },
  { label: "Unisex", href: "/shop?category=Unisex" },
  { label: "Formal Fragrances", href: "/shop?category=Oud" },
  { label: "Partials", href: "/partials" },
  { label: "Best Sellers", href: "/shop?bestSeller=true" },
];

const seasonsDropdown = [
  { label: "Summer", href: "/shop?season=Summer" },
  { label: "Winter", href: "/shop?season=Winter" },
  { label: "Spring", href: "/shop?season=Spring" },
  { label: "Fall", href: "/shop?season=Fall" },
];

const brandsDropdown = [
  { label: "Niche", href: "/shop?brand=niche" },
  { label: "UAE Brands", href: "/shop?brand=uae" },
  { label: "Designers", href: "/shop?brand=designer" },
];

function DesktopDropdown({
  label,
  items,
  href,
  open,
  onOpen,
  onCloseImmediate,
}: {
  label: string;
  items: { label: string; href: string }[];
  href?: string;
  open: boolean;
  onOpen: () => void;
  onCloseImmediate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseImmediate();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open, onCloseImmediate]);

  return (
    <div className="relative" ref={ref} onMouseEnter={onOpen}>
      <div className="flex items-center gap-1">
        {href ? (
          <Link
            href={href}
            className="text-[11px] uppercase tracking-[0.15em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (open ? onCloseImmediate() : onOpen())}
            className="text-[11px] uppercase tracking-[0.15em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {label}
          </button>
        )}
        <button
          type="button"
          onClick={() => (open ? onCloseImmediate() : onOpen())}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={`${label} dropdown`}
        >
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50 transition-all duration-200 ${
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-1 pointer-events-none"
        }`}
      >
        <div className="min-w-[220px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-[0_18px_40px_var(--shadow-color)] overflow-hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                onCloseImmediate();
              }}
              className="block w-full text-left px-5 py-3.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--gold-tint)] border-b border-[var(--border)] last:border-b-0 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const { theme, toggle } = useTheme();
  const { user, fetchUser, logout } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{id:string;name:string;brand:string;images:string;category:string;slug?:string;brandSlug?:string;canonicalPath?:string}[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<{id:string;message:string}[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    let cacheTimer: number | null = null;

    try {
      const cached = sessionStorage.getItem(ANNOUNCEMENTS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { ts: number; data: { id: string; message: string }[] };
        if (Date.now() - parsed.ts < ANNOUNCEMENTS_CACHE_TTL) {
          cacheTimer = window.setTimeout(() => {
            setAnnouncements(parsed.data || []);
          }, 0);
          return () => {
            if (cacheTimer !== null) window.clearTimeout(cacheTimer);
          };
        }
      }
    } catch {
      // ignore parse errors
    }

    fetch("/api/notifications?active=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAnnouncements(data);
          try {
            sessionStorage.setItem(ANNOUNCEMENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
          } catch {
            // ignore storage errors (e.g., disabled, quota exceeded, private mode)
          }
        }
      })
      .catch(() => {});

    return () => {
      if (cacheTimer !== null) window.clearTimeout(cacheTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (searchDebounce.current) {
        clearTimeout(searchDebounce.current);
      }
      if (dropdownCloseTimer.current) {
        clearTimeout(dropdownCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    if (userMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobileMenuOpen(false);
      setOpenDropdown(null);
      setMobileExpanded(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleSearchInput = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!val.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/perfumes/search?q=${encodeURIComponent(val.trim())}`)
        .then((r) => {
          if (!r.ok) return { perfumes: [] };
          return r.json();
        })
        .then((data) => {
          const perfumes = Array.isArray(data?.perfumes) ? data.perfumes : [];
          setSearchResults(perfumes.slice(0, 6));
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);
  }, []);

  const openDropdownWithIntent = (name: string) => {
    if (dropdownCloseTimer.current) {
      clearTimeout(dropdownCloseTimer.current);
      dropdownCloseTimer.current = null;
    }
    setOpenDropdown(name);
  };

  const closeDropdownImmediately = () => {
    if (dropdownCloseTimer.current) {
      clearTimeout(dropdownCloseTimer.current);
      dropdownCloseTimer.current = null;
    }
    setOpenDropdown(null);
  };

  const toggleMobileExpanded = (name: string) => {
    setMobileExpanded((prev) => (prev === name ? null : name));
  };

  return (
    <div className="min-h-screen">
      {/* Announcement bar — loops content enough times to fill the bar with no gaps */}
      {announcements.length > 0 && (
        <div className="bg-[var(--gold)] text-black overflow-hidden">
          <div className="marquee-track whitespace-nowrap py-1.5">
            {/* Two identical halves: first half scrolls out, second half replaces it seamlessly */}
            {[0, 1].map((half) =>
              Array.from({ length: 10 }).map((_, i) =>
                announcements.map((a) => (
                  <span key={`${a.id}-${half}-${i}`} className="text-[10px] uppercase tracking-[0.3em] font-medium inline-block px-8">
                    {a.message}
                  </span>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[var(--bg-base)]/95 backdrop-blur-md border-b border-[var(--border)] shadow-sm"
            : "bg-[var(--bg-base)]"
        }`}
      >
        <div className="px-[5%] flex items-center justify-between h-16">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/valore-logo.png" alt="Valore Parfums" width={36} height={36} className="rounded-full object-cover" />
            <h1 className="font-serif text-2xl font-light tracking-wide text-[var(--gold)]">
              Valore Parfums
            </h1>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-7">
            <Link
              href="/"
              className={`text-[11px] uppercase tracking-[0.15em] transition-colors ${
                pathname === "/" ? "text-[var(--gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Home
            </Link>
            <DesktopDropdown
              label="Shop"
              href="/shop"
              items={shopDropdown}
              open={openDropdown === "shop"}
              onOpen={() => openDropdownWithIntent("shop")}
              onCloseImmediate={closeDropdownImmediately}
            />
            <DesktopDropdown
              label="Seasons"
              items={seasonsDropdown}
              open={openDropdown === "seasons"}
              onOpen={() => openDropdownWithIntent("seasons")}
              onCloseImmediate={closeDropdownImmediately}
            />
            <DesktopDropdown
              label="Brands"
              items={brandsDropdown}
              open={openDropdown === "brands"}
              onOpen={() => openDropdownWithIntent("brands")}
              onCloseImmediate={closeDropdownImmediately}
            />
            {user ? (
              <>
                <Link
                  href="/track"
                  className={`text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    pathname === "/track" ? "text-[var(--gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  My Orders
                </Link>
                <Link
                  href="/requests"
                  className={`text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    pathname === "/requests" ? "text-[var(--gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  My Requests
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/track"
                  className={`text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    pathname === "/track" ? "text-[var(--gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Track Order
                </Link>
                <Link
                  href="/login"
                  className={`text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    pathname === "/login" ? "text-[var(--gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Login
                </Link>
              </>
            )}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors"
            >
              <Search size={18} />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggle}
              className="flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors"
              title={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
            >
              {(!mounted || theme === "dark") ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Wishlist */}
            {user && (
              <Link href="/wishlist" className="hidden sm:flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">
                <Heart size={18} />
              </Link>
            )}

            {/* User */}
            <div className="relative flex items-center justify-center" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors"
              >
                <User size={18} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-[280px] max-w-[calc(100vw-1rem)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded shadow-lg z-50 animate-fade-up overflow-hidden">
                  {user ? (
                    <>
                      <div className="px-5 py-3 border-b border-[var(--border)]">
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate" title={user.email}>{user.email}</p>
                      </div>
                      <Link href="/track" onClick={() => setUserMenuOpen(false)} className="block px-5 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--gold-tint)] transition-colors">
                        My Orders
                      </Link>
                      <div className="px-5 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] border-t border-[var(--border)]">
                        Account Controls
                      </div>
                      <Link href="/wishlist" onClick={() => setUserMenuOpen(false)} className="block px-5 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--gold-tint)] border-b border-[var(--border)] transition-colors">
                        Wishlist
                      </Link>
                      <Link href="/requests" onClick={() => setUserMenuOpen(false)} className="block px-5 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--gold-tint)] border-b border-[var(--border)] transition-colors">
                        My Requests
                      </Link>
                      <button
                        onClick={async () => { await logout(); setUserMenuOpen(false); }}
                        className="w-full text-left px-5 py-3 text-sm text-[var(--error)] hover:bg-[rgba(248,113,113,0.05)] flex items-center gap-2 transition-colors"
                      >
                        <LogOut size={14} /> Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setUserMenuOpen(false)} className="block px-5 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--gold-tint)] border-b border-[var(--border)] transition-colors">
                        Sign In
                      </Link>
                      <Link href="/signup" onClick={() => setUserMenuOpen(false)} className="block px-5 py-3 text-sm text-[var(--gold)] hover:bg-[var(--gold-tint)] transition-colors">
                        Create Account
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Cart */}
            <Link href="/cart" className="relative flex items-center justify-center">
              <ShoppingBag size={18} className="text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-[var(--gold)] text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Search Overlay */}
        {searchOpen && (
          <div className="border-t border-[var(--border)] bg-[var(--bg-base)]">
            <form onSubmit={handleSearch} className="px-[5%] py-4 flex items-center gap-3">
              <Search size={18} className="text-[var(--text-muted)] flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search perfumes, brands, notes..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
              {searchLoading && <div className="spinner !w-4 !h-4 flex-shrink-0" />}
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </form>
            {/* Live search results */}
            {searchQuery.trim() && (
              <div className="px-[5%] pb-4">
                {searchResults.length > 0 ? (
                  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded divide-y divide-[var(--border)] max-h-80 overflow-y-auto">
                    {searchResults.map((p) => {
                      const imgs: string[] = JSON.parse(p.images || "[]");
                      return (
                        <Link
                          key={p.id}
                          href={p.canonicalPath || buildCanonicalProductPath(p)}
                          onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--gold-tint)] transition-colors"
                        >
                          <div className="w-10 h-10 rounded bg-[var(--bg-surface)] flex-shrink-0 overflow-hidden relative">
                            {imgs[0] ? (
                              <Image src={imgs[0]} alt={p.name} fill className="object-cover" sizes="40px" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center font-serif text-sm text-[var(--text-muted)]">{p.name[0]}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{p.brand} · {p.category}</p>
                          </div>
                        </Link>
                      );
                    })}
                    <Link
                      href={`/shop?q=${encodeURIComponent(searchQuery.trim())}`}
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                      className="block text-center py-3 text-xs uppercase tracking-wider text-[var(--gold)] hover:bg-[var(--gold-tint)] transition-colors"
                    >
                      View all results →
                    </Link>
                  </div>
                ) : !searchLoading ? (
                  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-6 text-center">
                    <p className="text-sm text-[var(--text-muted)]">No perfumes found for &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[calc(2.5rem+4rem)] z-40 bg-[var(--bg-base)] border-t border-[var(--border)] overflow-y-auto">
          <nav className="px-[5%] py-6 space-y-1">
            <Link href="/" className="block py-3 text-sm uppercase tracking-wider border-b border-[var(--border)]">
              Home
            </Link>
            <div className="border-b border-[var(--border)]">
              <div className="flex items-center justify-between py-3">
                <Link href="/shop" className="text-sm uppercase tracking-wider">Shop</Link>
                <button
                  type="button"
                  onClick={() => toggleMobileExpanded("shop")}
                  className="p-1 text-[var(--text-secondary)]"
                  aria-label="Toggle shop submenu"
                >
                  <ChevronDown size={16} className={`transition-transform ${mobileExpanded === "shop" ? "rotate-180" : ""}`} />
                </button>
              </div>
              {mobileExpanded === "shop" && (
                <div className="pb-3 space-y-1">
                  {shopDropdown.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileExpanded(null);
                      }}
                      className="block py-2.5 pl-4 text-sm text-[var(--text-secondary)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() => toggleMobileExpanded("seasons")}
                className="w-full flex items-center justify-between py-3"
              >
                <span className="text-sm uppercase tracking-wider">Seasons</span>
                <ChevronDown size={16} className={`transition-transform ${mobileExpanded === "seasons" ? "rotate-180" : ""}`} />
              </button>
              {mobileExpanded === "seasons" && (
                <div className="pb-3 space-y-1">
                  {seasonsDropdown.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileExpanded(null);
                      }}
                      className="block py-2.5 pl-4 text-sm text-[var(--text-secondary)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() => toggleMobileExpanded("brands")}
                className="w-full flex items-center justify-between py-3"
              >
                <span className="text-sm uppercase tracking-wider">Brands</span>
                <ChevronDown size={16} className={`transition-transform ${mobileExpanded === "brands" ? "rotate-180" : ""}`} />
              </button>
              {mobileExpanded === "brands" && (
                <div className="pb-3 space-y-1">
                  {brandsDropdown.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileExpanded(null);
                      }}
                      className="block py-2.5 pl-4 text-sm text-[var(--text-secondary)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link href="/track" className="block py-3 text-sm uppercase tracking-wider border-b border-[var(--border)]">
              {user ? "My Orders" : "Track Order"}
            </Link>
            {user ? (
              <Link href="/requests" className="block py-3 text-sm uppercase tracking-wider border-b border-[var(--border)]">
                My Requests
              </Link>
            ) : (
              <>
                <Link href="/login" className="block py-3 text-sm uppercase tracking-wider border-b border-[var(--border)]">
                  Login
                </Link>
                <Link href="/signup" className="block py-3 text-sm uppercase tracking-wider text-[var(--gold)]">
                  Create Account
                </Link>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Main */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-20 bg-[var(--bg-surface)]">
        <div className="px-[5%] py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-1">
                <Image src="/valore-logo.png" alt="Valore Parfums" width={32} height={32} className="rounded-full object-cover" />
                <h2 className="font-serif text-xl font-light text-[var(--gold)]">Valore Parfums</h2>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                Curated luxury in every drop. Experience premium perfume decants from the world&apos;s finest fragrance houses.
              </p>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Shop</h3>
              <ul className="space-y-2.5">
                {shopDropdown.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Seasons</h3>
              <ul className="space-y-2.5">
                {seasonsDropdown.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Account</h3>
              <ul className="space-y-2.5">
                <li><Link href="/track" className="text-sm text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">My Orders</Link></li>
                <li><Link href="/wishlist" className="text-sm text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">Wishlist</Link></li>
                <li><Link href="/cart" className="text-sm text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">Cart</Link></li>
                {/* Admin Panel button removed */}
              </ul>
            </div>
          </div>
          <div className="gold-line my-8" />
          <p className="text-center text-[10px] text-[var(--text-muted)] tracking-wider">
            © {new Date().getFullYear()} Valore Parfums. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
