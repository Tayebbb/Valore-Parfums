"use client";

import { useEffect } from "react";
import { useTheme } from "@/store/theme";

export function ThemeInitializer() {
  const setTheme = useTheme((s) => s.setTheme);

  useEffect(() => {
    const saved = localStorage.getItem("vp-theme") as "dark" | "light" | null;
    const theme = saved || "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    setTheme(theme);
  }, [setTheme]);

  return null;
}
