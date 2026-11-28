"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EMPTY, formatExact, formatRelative, formatWhen } from "@/lib/format";
import { useServerTimeZone } from "@/lib/queries";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

interface RelativeTimeProps {
  value: string | null | undefined;
  /** "relative" → "3h ago"; "when" → "Today 18:30"; "both" → "Today 18:30 · in 32 min". */
  format?: "relative" | "when" | "both";
  className?: string;
  /** Off inside rows that are already a single tab stop. */
  focusable?: boolean;
}

/** A time label with the exact timestamp in a tooltip. */
export default function RelativeTime({
  value,
  format = "relative",
  className,
  focusable = true,
}: RelativeTimeProps) {
  const now = useNow();
  const timeZone = useServerTimeZone();
  if (!value) return <span className={className}>{EMPTY}</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className={className}>{EMPTY}</span>;
  }

  const relative = formatRelative(date, now);
  const when = formatWhen(date, timeZone, now);
  const text =
    format === "relative" ? relative : format === "when" ? when : `${when} · ${relative}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={value}
          tabIndex={focusable ? 0 : undefined}
          className={cn(
            "rounded-sm underline decoration-transparent decoration-dotted underline-offset-4 outline-none hover:decoration-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
        >
          {text}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatExact(date, timeZone)}</TooltipContent>
    </Tooltip>
  );
}
