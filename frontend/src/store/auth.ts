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

function getNetworkErrorMessage() {
  return "Cannot reach authentication service. Please ensure backend is running and try again.";
}

async function tryReadJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchMeOnce(): Promise<{ kind: "fetched"; user: UserInfo | null } | { kind: "skipped" }> {
  const now = Date.now();
  if (inFlightFetch) return inFlightFetch;
  if (now - lastFetchAt < AUTH_ME_TTL) return { kind: "skipped" };

  inFlightFetch = fetch("/api/auth/me")
    .then(async (res) => {
      if (!res.ok) return { kind: "fetched", user: null } as const;
      const user = await tryReadJson<UserInfo | null>(res);
      return { kind: "fetched", user } as const;
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
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await tryReadJson<{ error?: string }>(res);
        return err?.error || "Login failed";
      }
      const user = await tryReadJson<UserInfo>(res);
      if (!user) return "Invalid response from authentication service";
      lastFetchAt = Date.now();
      authVersion++;
      set({ user });
      return null;
    } catch {
      return getNetworkErrorMessage();
    }
  },

  signup: async (name, email, phone, password) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });
      if (!res.ok) {
        const err = await tryReadJson<{ error?: string }>(res);
        return err?.error || "Signup failed";
      }
      const user = await tryReadJson<UserInfo>(res);
      if (!user) return "Invalid response from authentication service";
      lastFetchAt = Date.now();
      authVersion++;
      set({ user });
      return null;
    } catch {
      return getNetworkErrorMessage();
    }
  },

  googleSignIn: async (idToken) => {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const err = await tryReadJson<{ error?: string }>(res);
        return err?.error || "Google sign-in failed";
      }
      const user = await tryReadJson<UserInfo>(res);
      if (!user) return "Invalid response from authentication service";
      lastFetchAt = Date.now();
      authVersion++;
      set({ user });
      return null;
    } catch {
      return getNetworkErrorMessage();
    }
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    lastFetchAt = Date.now();
    authVersion++;
    set({ user: null });
  },
}));
