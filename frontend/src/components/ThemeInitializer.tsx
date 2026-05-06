"use client";

import { useEffect } from "react";
import { useTheme } from "@/store/theme";
import { safeStorageGetItem } from "@/lib/safe-storage";

export function ThemeInitializer() {
  const setTheme = useTheme((s) => s.setTheme);

  useEffect(() => {
    const saved = safeStorageGetItem("vp-theme", "localStorage") as "dark" | "light" | null;
    const theme = saved || "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    setTheme(theme);
  }, [setTheme]);

  return null;
}
