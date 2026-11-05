"use client";

import Link from "next/link";
import { useState } from "react";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const unsubscribe = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/customers/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Could not save your preference. Please try again.",
        );
      setDone(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
      <div className="w-full max-w-lg space-y-6 rounded border border-[var(--border)] bg-[var(--bg-card)] p-7 sm:p-10">
        <Link href="/" className="font-serif text-2xl text-[var(--gold)]">
          Valore Parfums
        </Link>
        <h1 className="font-serif text-3xl">
          {done ? "You’re unsubscribed" : "Email preferences"}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {done
            ? "You won’t receive further promotional emails. Order confirmations and delivery updates will still reach you."
            : "Unsubscribe to stop receiving promotional emails and offers from Valore Parfums. You’ll still receive emails about your orders."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        )}
        {!done &&
          (token ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void unsubscribe()}
              className="min-h-11 rounded bg-[var(--gold)] px-5 py-3 text-sm font-medium text-black hover:bg-[var(--gold-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Unsubscribe from promotions"}
            </button>
          ) : (
            <p role="alert" className="text-sm text-[var(--error)]">
              Please open the unsubscribe link in your email.
            </p>
          ))}
        {done && (
          <Link
            href="/"
            className="inline-block text-sm text-[var(--gold)] underline underline-offset-4"
          >
            Return to the store
          </Link>
        )}
      </div>
    </main>
  );
}
