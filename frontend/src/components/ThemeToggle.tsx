"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

const noop = () => () => {};

/** The stored theme is unknown during SSR; render neutral until mounted. */
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  if (compact) {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const Icon = mounted && resolvedTheme === "light" ? SunIcon : MoonIcon;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
      >
        <Icon />
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1"
    >
      {OPTIONS.map((option) => {
        const checked = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={checked}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              checked && "bg-raised text-foreground"
            )}
          >
            <option.icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
