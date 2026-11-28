"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ActivityIcon,
  BellIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
  Settings2Icon,
  type LucideIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHeader } from "@/components/PageStates";
import DefaultsSection from "@/components/settings/DefaultsSection";
import GeneralSection from "@/components/settings/GeneralSection";
import MaintenanceSection from "@/components/settings/MaintenanceSection";
import MonitoringSection from "@/components/settings/MonitoringSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useSearchParamState } from "@/hooks/use-search-param-state";

const SECTIONS = [
  { key: "notifications", label: "Notifications", icon: BellIcon },
  { key: "monitoring", label: "Monitoring", icon: ActivityIcon },
  { key: "defaults", label: "Job defaults", icon: SlidersHorizontalIcon },
  { key: "general", label: "General", icon: Settings2Icon },
  { key: "maintenance", label: "Maintenance", icon: WrenchIcon },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

type SectionKey = (typeof SECTIONS)[number]["key"];

const DirtyDot = ({ label }: { label: string }) => (
  <span className="ml-auto size-2 rounded-full bg-stale" role="img" aria-label={label} />
);

function SettingsPage() {
  const [params, update] = useSearchParamState();
  const { data: settings, error, refetch } = useSettings();
  const [dirty, setDirty] = useState<Partial<Record<SectionKey, boolean>>>({});
  const active: SectionKey =
    SECTIONS.find((s) => s.key === params.get("section"))?.key ?? "notifications";
  const anyDirty = Object.values(dirty).some(Boolean);

  const report = useCallback(
    (key: SectionKey) => (value: boolean) =>
      setDirty((d) => (Boolean(d[key]) === value ? d : { ...d, [key]: value })),
    []
  );

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const go = (key: SectionKey) =>
    update({ section: key === "notifications" ? null : key });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Alerts, monitoring and the defaults new backups start from."
      />

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-8 lg:block">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((s) => {
              const current = s.key === active;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => go(s.key)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      current && "bg-raised text-foreground"
                    )}
                  >
                    <s.icon
                      className={cn("size-[18px]", current && "text-primary")}
                      aria-hidden
                    />
                    {s.label}
                    {dirty[s.key] && <DirtyDot label="Unsaved changes" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="lg:hidden">
          <Select value={active} onValueChange={(v) => go(v as SectionKey)}>
            <SelectTrigger aria-label="Settings section" className="h-11 w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <s.icon aria-hidden />
                  {s.label}
                  {dirty[s.key] && " · unsaved"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          {error && !settings ? (
            <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load settings" />
          ) : !settings ? (
            <div className="flex flex-col gap-5" aria-busy>
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-96 rounded-xl" />
            </div>
          ) : (
            // Every section stays mounted so drafts survive switching sections.
            SECTIONS.map((s) => (
              <section
                key={s.key}
                hidden={s.key !== active}
                aria-label={s.label}
              >
                {s.key === "notifications" && (
                  <NotificationsSection settings={settings} onDirtyChange={report("notifications")} />
                )}
                {s.key === "monitoring" && (
                  <MonitoringSection settings={settings} onDirtyChange={report("monitoring")} />
                )}
                {s.key === "defaults" && (
                  <DefaultsSection settings={settings} onDirtyChange={report("defaults")} />
                )}
                {s.key === "general" && (
                  <GeneralSection settings={settings} onDirtyChange={report("general")} />
                )}
                {s.key === "maintenance" && <MaintenanceSection settings={settings} />}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
