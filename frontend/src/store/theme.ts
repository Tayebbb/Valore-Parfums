"use client";

import { create } from "zustand";
import { safeStorageGetItem, safeStorageSetItem } from "@/lib/safe-storage";

type Theme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeStore>((set) => ({
  theme: (typeof window !== "undefined"
    ? (safeStorageGetItem("vp-theme", "localStorage") as Theme) || "dark"
    : "dark"),

  toggle: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        safeStorageSetItem("vp-theme", next, "localStorage");
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(next);
      }
      return { theme: next };
    }),

  setTheme: (t: Theme) => {
    if (typeof window !== "undefined") {
      safeStorageSetItem("vp-theme", t, "localStorage");
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(t);
    }
    set({ theme: t });
  },
}));
