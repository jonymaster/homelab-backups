"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import JobWizard from "@/components/JobWizard";
import { EmptyState, ErrorState } from "@/components/PageStates";
import { ApiError } from "@/lib/api";
import { useJob } from "@/lib/queries";
import { idParam, useSearchParamState } from "@/hooks/use-search-param-state";

const backToJobs = (
  <Button asChild variant="outline">
    <Link href="/jobs">Back to jobs</Link>
  </Button>
);

function EditJob({ id }: { id: number }) {
  const router = useRouter();
  const { data: job, error, refetch } = useJob(id);

  if (error && !job) {
    return error instanceof ApiError && error.status === 404 ? (
      <EmptyState
        icon={SearchXIcon}
        title="Job not found"
        description="It may have been deleted."
        action={backToJobs}
      />
    ) : (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="Couldn't load this job"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/jobs/view?id=${id}`}
          className="flex min-h-8 w-fit items-center gap-1.5 text-[13px] text-link hover:underline"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Back to {job?.name ?? "job"}
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em]">
          Edit backup
        </h1>
      </header>
      {job ? (
        <JobWizard
          key={job.id}
          job={job}
          onSaved={(saved) => router.push(`/jobs/view?id=${saved.id}`)}
        />
      ) : (
        <Skeleton className="h-96 rounded-xl" aria-busy />
      )}
    </div>
  );
}

function EditJobPage() {
  const [params] = useSearchParamState();
  const id = idParam(params.get("id"));
  if (id === null) {
    return (
      <EmptyState icon={SearchXIcon} title="No job selected" action={backToJobs} />
    );
  }
  return <EditJob id={id} />;
}

export default function Page() {
  return (
    <Suspense>
      <EditJobPage />
    </Suspense>
  );
}
