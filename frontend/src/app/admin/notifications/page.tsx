"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toaster";
import { Plus, Trash2, GripVertical, Eye, EyeOff } from "lucide-react";

interface Notification {
  id: string;
  message: string;
  isActive: boolean;
  sortOrder: number;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = () => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then(setNotifications)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newMessage.trim()) return toast("Enter a message", "error");
    setAdding(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage.trim(), sortOrder: notifications.length }),
      });
      const n = await res.json();
      setNotifications([...notifications, n]);
      setNewMessage("");
      toast("Notification added", "success");
    } catch {
      toast("Failed to add", "error");
    }
    setAdding(false);
  };

  const toggleActive = async (n: Notification) => {
    const updated = { ...n, isActive: !n.isActive };
    await fetch(`/api/notifications/${n.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setNotifications(notifications.map((x) => (x.id === n.id ? updated : x)));
    toast(updated.isActive ? "Notification visible" : "Notification hidden", "success");
  };

  const remove = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications(notifications.filter((x) => x.id !== id));
    toast("Notification removed", "success");
  };

  const updateMessage = async (n: Notification, message: string) => {
    await fetch(`/api/notifications/${n.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...n, message }),
    });
    setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, message } : x)));
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-serif text-3xl font-light">Notifications</h1>
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-3xl font-light">Notifications</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage the announcement bar messages shown at the top of the store
        </p>
        <div className="gold-line mt-3" />
      </div>

      {/* Add new */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">New Notification</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Free delivery on orders above 500 BDT!"
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-4 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
          />
          <button
            onClick={add}
            disabled={adding}
            className="flex items-center gap-1.5 bg-[var(--gold)] text-black px-5 py-2.5 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Plus size={14} /> {adding ? "Adding..." : "Push"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">
          Active Messages ({notifications.filter((n) => n.isActive).length} / {notifications.length})
        </h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">No notifications yet. Add one above.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-center gap-3 border border-[var(--border)] rounded px-4 py-3 transition-colors ${
                  n.isActive ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-surface)] opacity-50"
                }`}
              >
                <GripVertical size={14} className="text-[var(--text-muted)] flex-shrink-0 cursor-grab" />
                <input
                  type="text"
                  value={n.message}
                  onChange={(e) => setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, message: e.target.value } : x)))}
                  onBlur={(e) => updateMessage(n, e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none focus:bg-[var(--bg-input)] focus:px-2 focus:py-1 focus:rounded focus:border focus:border-[var(--gold)] transition-all"
                />
                <button
                  onClick={() => toggleActive(n)}
                  className={`flex-shrink-0 transition-colors ${n.isActive ? "text-[var(--success)]" : "text-[var(--text-muted)]"}`}
                  title={n.isActive ? "Hide" : "Show"}
                >
                  {n.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => remove(n.id)}
                  className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {notifications.filter((n) => n.isActive).length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Preview</h3>
          <div className="bg-[var(--gold)] text-black overflow-hidden rounded">
            <div className="marquee-track whitespace-nowrap py-1.5">
              {/* Two identical halves for seamless loop */}
              {[0, 1].map((half) =>
                Array.from({ length: 10 }).map((_, i) =>
                  notifications
                    .filter((n) => n.isActive)
                    .map((n) => (
                      <span key={`${n.id}-${half}-${i}`} className="text-[10px] uppercase tracking-[0.3em] font-medium inline-block px-8">
                        {n.message}
                      </span>
                    ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
