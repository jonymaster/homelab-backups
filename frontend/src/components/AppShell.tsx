"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ArrowUpCircleIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  ListIcon,
  PlusIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClock, useServer, useUpdates } from "@/lib/queries";
import { formatTime, formatVersion, validTimeZone } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import DefaultTheme from "./DefaultTheme";
import ThemeToggle from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboardIcon,
    match: (p) => p === "/",
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: ListIcon,
    match: (p) => p.startsWith("/jobs"),
  },
  {
    href: "/activity",
    label: "Activity",
    icon: ActivityIcon,
    match: (p) => p.startsWith("/activity"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (p) => p.startsWith("/settings"),
  },
];

function Logo() {
  return (
    <Link
      href="/"
      className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 font-bold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <DatabaseIcon className="size-7 text-primary" aria-hidden />
      <span className="text-base">Homelab Backups</span>
    </Link>
  );
}

function ServerClock() {
  const { data, isError } = useServer();
  const now = useNow();
  const clockSetting = useClock();
  if (isError) {
    return <span className="text-muted-foreground">Server unreachable</span>;
  }
  if (!data) return <span className="text-muted-foreground">Connecting…</span>;
  const timeZone = validTimeZone(data.timezone);
  const clock = formatTime(now, timeZone, clockSetting);
  return (
    <>
      <span className="text-muted-foreground">Server time</span>
      <span className="font-semibold">
        {clock} · {data.timezone}
      </span>
      <span className="text-muted-foreground">
        {formatVersion(data.version)}
      </span>
    </>
  );
}

function UpdateBadge() {
  const { data } = useUpdates();
  if (!data?.update_available || !data.latest) return null;
  return (
    <Link
      href="/settings?section=maintenance"
      className="flex min-h-11 items-center gap-2 rounded-xl border border-stale/40 bg-stale/8 px-3 text-[13px] font-medium text-stale outline-none hover:bg-stale/12 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowUpCircleIcon className="size-4" aria-hidden />
      Update available: {formatVersion(data.latest)}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <DefaultTheme />

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-divider px-4 py-6 lg:flex">
        <Logo />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-raised text-foreground"
                )}
              >
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <UpdateBadge />
          <ThemeToggle />
          <div className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-[13px]">
            <ServerClock />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-divider bg-background/90 px-2 py-1 backdrop-blur lg:hidden">
        <Logo />
        <ThemeToggle compact />
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[1180px] min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12"
      >
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-divider bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {[
          ...NAV.slice(0, -1),
          {
            href: "/jobs/new",
            label: "New",
            icon: PlusIcon,
            match: (p: string) => p === "/jobs/new",
          },
          ...NAV.slice(-1),
        ].map((item) => {
          const active =
            item.href === "/jobs"
              ? item.match(pathname) && pathname !== "/jobs/new"
              : item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground outline-none focus-visible:bg-raised",
                active && "text-primary"
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
