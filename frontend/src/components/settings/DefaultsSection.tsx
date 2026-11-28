"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/PageStates";
import { ExclusionFields, RetentionSelect } from "@/components/JobOptionFields";
import type { Settings } from "@/lib/api";
import { formatTimeString } from "@/lib/format";
import { dailyCronAt, parsePatterns } from "@/lib/job-options";
import { useClock } from "@/lib/queries";
import {
  FieldLabel,
  Hint,
  SaveBar,
  SectionHeading,
  useSectionDraft,
} from "./SettingsForm";

export default function DefaultsSection({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const clock = useClock();
  const form = useSectionDraft("defaults", settings.defaults, {
    label: "Job defaults",
    onDirtyChange,
  });
  const { value } = form;
  // Raw text keeps blank lines and trailing newlines while typing.
  const [patternsText, setPatternsText] = useState<string | null>(null);
  const timeValid = dailyCronAt(value.schedule_time) !== null;

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (timeValid) form.save();
        }}
        className="flex flex-col gap-6"
      >
        <SectionHeading
          title="Job defaults"
          description="Starting values for new jobs. Existing jobs keep their own settings."
        />

        <RetentionSelect
          value={value.retention_days}
          onChange={(retention_days) => form.patch({ retention_days })}
        />

        <ExclusionFields
          presets={value.exclude_presets}
          onPresetsChange={(exclude_presets) => form.patch({ exclude_presets })}
          patternsText={patternsText ?? value.exclude_patterns.join("\n")}
          onPatternsTextChange={(text) => {
            setPatternsText(text);
            form.patch({ exclude_patterns: parsePatterns(text) });
          }}
        />

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-time`}>Default backup time</FieldLabel>
          <Input
            id={`${id}-time`}
            type="time"
            value={value.schedule_time}
            onChange={(e) => form.patch({ schedule_time: e.target.value })}
            className="w-full sm:w-48"
            aria-invalid={!timeValid}
            aria-describedby={`${id}-time-hint`}
          />
          <Hint id={`${id}-time-hint`}>
            New jobs start as daily at{" "}
            {timeValid ? formatTimeString(value.schedule_time, clock) : "this time"},
            server time. Pick a quiet hour.
          </Hint>
        </div>

        <SaveBar
          dirty={form.dirty}
          pending={form.pending}
          error={form.error}
          invalid={timeValid ? null : "Pick a default backup time."}
          onDiscard={() => {
            setPatternsText(null);
            form.discard();
          }}
        />
      </form>
    </Card>
  );
}
