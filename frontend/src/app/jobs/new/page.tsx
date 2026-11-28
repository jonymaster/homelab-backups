"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import JobWizard from "@/components/JobWizard";
import { useSettings } from "@/lib/queries";

export default function NewJobPage() {
  const router = useRouter();
  const { data: settings, isError } = useSettings();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/jobs"
          className="flex min-h-8 w-fit items-center gap-1.5 text-[13px] text-link hover:underline"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Back to jobs
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em]">
          New backup
        </h1>
      </header>
      {/* Wait for the defaults so the draft starts from them; fall back if they fail. */}
      {settings || isError ? (
        <JobWizard
          defaults={settings?.defaults}
          onSaved={(job) => router.push(`/jobs/view?id=${job.id}`)}
        />
      ) : (
        <Skeleton className="h-96 rounded-xl" aria-busy />
      )}
    </div>
  );
}
