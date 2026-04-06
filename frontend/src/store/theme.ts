"use client";

import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeStore>((set) => ({
  theme: (typeof window !== "undefined"
    ? (localStorage.getItem("vp-theme") as Theme) || "dark"
    : "dark"),

  toggle: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("vp-theme", next);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(next);
      }
      return { theme: next };
    }),

  setTheme: (t: Theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("vp-theme", t);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(t);
    }
    set({ theme: t });
  },
}));
