"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useSettings } from "@/lib/queries";

// next-themes' own key; a value there means this browser has a theme.
const THEME_KEY = "theme";
// Set while that value came from the server default rather than the user.
const FROM_DEFAULT_KEY = "theme-from-default";

/** Call when the user picks a theme, so later default changes leave it alone. */
export function markThemeChosen() {
  try {
    localStorage.removeItem(FROM_DEFAULT_KEY);
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }
}

/** Applies `general.default_theme` to browsers with no saved choice. */
export default function DefaultTheme() {
  const { data } = useSettings();
  const { setTheme } = useTheme();
  const preferred = data?.general.default_theme;

  useEffect(() => {
    if (!preferred) return;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const fromDefault = localStorage.getItem(FROM_DEFAULT_KEY) === "1";
      if (saved !== null && !fromDefault) return;
      if (saved !== preferred) setTheme(preferred);
      localStorage.setItem(FROM_DEFAULT_KEY, "1");
    } catch {
      // Without storage there is no saved choice to respect either way.
    }
  }, [preferred, setTheme]);

  return null;
}
