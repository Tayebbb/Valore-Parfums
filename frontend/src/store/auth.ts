"use client";

import { create } from "zustand";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthStore {
  user: UserInfo | null;
  loading: boolean;
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (name: string, email: string, phone: string, password: string) => Promise<string | null>;
  googleSignIn: (idToken: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AUTH_ME_TTL = 30_000;
let lastFetchAt = 0;
let inFlightFetch: Promise<{ kind: "fetched"; user: UserInfo | null }> | null = null;
// Monotonic version incremented on every auth mutation (login/signup/logout).
// fetchUser checks this before applying results to discard stale responses.
let authVersion = 0;

async function fetchMeOnce(): Promise<{ kind: "fetched"; user: UserInfo | null } | { kind: "skipped" }> {
  const now = Date.now();
  if (inFlightFetch) return inFlightFetch;
  if (now - lastFetchAt < AUTH_ME_TTL) return { kind: "skipped" };

  inFlightFetch = fetch("/api/auth/me")
    .then(async (res) => {
      if (!res.ok) return { kind: "fetched", user: null } as const;
      return { kind: "fetched", user: (await res.json()) as UserInfo | null } as const;
    })
    .catch(() => ({ kind: "fetched", user: null } as const))
    .finally(() => {
      lastFetchAt = Date.now();
      inFlightFetch = null;
    });

  return inFlightFetch;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  fetchUser: async () => {
    const ver = authVersion;
    const data = await fetchMeOnce();
    // Discard result if a login/signup/logout happened while the request was in-flight
    if (authVersion !== ver) return;
    if (data.kind === "fetched") {
      set({ user: data.user, loading: false });
      return;
    }
    set((state) => ({ loading: false, user: state.user }));
  },

  login: async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      return err.error || "Login failed";
    }
    const user = await res.json();
    lastFetchAt = Date.now();
    authVersion++;
    set({ user });
    return null;
  },

  signup: async (name, email, phone, password) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      return err.error || "Signup failed";
    }
    const user = await res.json();
    lastFetchAt = Date.now();
    authVersion++;
    set({ user });
    return null;
  },

  googleSignIn: async (idToken) => {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return err.error || "Google sign-in failed";
    }
    const user = await res.json();
    lastFetchAt = Date.now();
    authVersion++;
    set({ user });
    return null;
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    lastFetchAt = Date.now();
    authVersion++;
    set({ user: null });
  },
}));
