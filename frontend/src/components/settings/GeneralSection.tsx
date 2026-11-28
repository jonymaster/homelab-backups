"use client";

import { useId } from "react";
import { GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/PageStates";
import type { Settings, ThemeChoice } from "@/lib/api";
import { formatClockTime, type Clock } from "@/lib/format";
import { isHttpUrl } from "@/lib/job-options";
import { useServer } from "@/lib/queries";
import { useOrigin } from "./MonitoringSection";
import {
  FieldLabel,
  Hint,
  SaveBar,
  SectionHeading,
  Segmented,
  useSectionDraft,
} from "./SettingsForm";

const CLOCKS: { value: Clock; label: string }[] = [
  { value: "24h", label: `24-hour · ${formatClockTime(18, 30, "24h")}` },
  { value: "12h", label: `12-hour · ${formatClockTime(18, 30, "12h")}` },
];

const THEMES: { value: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

export default function GeneralSection({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const origin = useOrigin();
  const { data: server } = useServer();
  const form = useSectionDraft("general", settings.general, {
    label: "General settings",
    onDirtyChange,
  });
  const { value } = form;
  const baseUrl = value.base_url ?? "";
  const baseUrlInvalid = baseUrl !== "" && !isHttpUrl(baseUrl);

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!baseUrlInvalid) form.save();
        }}
        className="flex flex-col gap-6"
      >
        <SectionHeading title="General" description="How the app shows times and where it lives." />

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground/80">Clock</span>
          <Segmented
            label="Clock"
            value={value.clock}
            options={CLOCKS}
            onChange={(clock) => form.patch({ clock })}
          />
          <Hint>Used for every time shown in the app.</Hint>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground/80">Default theme</span>
          <Segmented
            label="Default theme"
            value={value.default_theme}
            options={THEMES}
            onChange={(default_theme) => form.patch({ default_theme })}
          />
          <Hint>
            For browsers that have not picked a theme yet. The toggle in the
            sidebar still overrides it per browser.
          </Hint>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-url`}>Base URL</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => form.patch({ base_url: e.target.value.trim() || null })}
              placeholder={origin || "http://192.168.1.10:3000"}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-[1_1_260px] font-mono"
              aria-invalid={baseUrlInvalid}
              aria-describedby={`${id}-url-hint`}
            />
            {origin && baseUrl !== origin && (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => form.patch({ base_url: origin })}
              >
                <GlobeIcon />
                Use this address
              </Button>
            )}
          </div>
          <Hint id={`${id}-url-hint`} className={baseUrlInvalid ? "text-failed" : undefined}>
            {baseUrlInvalid
              ? "Start with http:// or https://."
              : "Used for links in notifications, so they open this app. Leave empty to send no links."}
          </Hint>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground/80">Server time zone</span>
          {server ? (
            <p className="w-fit rounded-lg bg-raised px-3.5 py-2.5 font-mono text-sm">
              {server.timezone}
            </p>
          ) : (
            <Skeleton className="h-10 w-48" />
          )}
          <Hint>
            Schedules and times use this zone. Change it with the{" "}
            <span className="font-mono text-foreground/80">TZ</span> variable of
            the backend container, then restart it.
          </Hint>
        </div>

        <SaveBar
          dirty={form.dirty}
          pending={form.pending}
          error={form.error}
          invalid={baseUrlInvalid ? "Fix the base URL to save." : null}
          onDiscard={form.discard}
        />
      </form>
    </Card>
  );
}
