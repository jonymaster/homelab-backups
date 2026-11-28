"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/PageStates";
import RunsTable from "@/components/RunsTable";

export default function ActivityPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Activity"
        description="Every backup run across all jobs, newest first."
      />
      <Suspense>
        <RunsTable />
      </Suspense>
    </div>
  );
}
