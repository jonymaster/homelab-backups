"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Job } from "@/lib/api";
import { useJobActions } from "@/lib/queries";

export const isJobRunning = (job: Job) =>
  job.status === "running" || job.health === "running";

function RunButton({
  job,
  variant = "outline",
  resumeWhenPaused = true,
}: {
  job: Job;
  variant?: "outline" | "default";
  /** Pausing only stops the schedule, so a paused job can still run by hand. */
  resumeWhenPaused?: boolean;
}) {
  const { run, resume } = useJobActions();
  const running = isJobRunning(job);

  if (resumeWhenPaused && job.paused && !running) {
    return (
      <Button
        variant={variant}
        onClick={() => resume.mutate(job)}
        disabled={resume.isPending}
      >
        <PlayIcon />
        Resume
      </Button>
    );
  }
  return (
    <Button
      variant={variant}
      onClick={() => run.mutate(job)}
      disabled={running || run.isPending}
    >
      {running || run.isPending ? (
        <LoaderCircleIcon className="animate-spin" />
      ) : (
        <PlayIcon />
      )}
      {running ? "Running…" : "Run now"}
    </Button>
  );
}

function DeleteDialog({
  job,
  open,
  onOpenChange,
  onDeleted,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { remove } = useJobActions();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {job.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The job, its schedule and its run history are removed. Backup files
            already in{" "}
            <span className="font-mono text-xs break-all text-foreground">
              {job.destination}
            </span>{" "}
            stay on disk.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault();
              remove.mutate(job, {
                onSuccess: () => {
                  onOpenChange(false);
                  onDeleted?.();
                },
              });
            }}
          >
            {remove.isPending ? "Deleting…" : "Delete job"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MoreMenu({
  job,
  showPause,
  showEdit,
  onDelete,
}: {
  job: Job;
  showPause: boolean;
  showEdit: boolean;
  onDelete: () => void;
}) {
  const { pause, resume } = useJobActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`More actions for ${job.name}`}
        >
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {showEdit && (
          <DropdownMenuItem asChild>
            <Link href={`/jobs/edit?id=${job.id}`}>
              <PencilIcon />
              Edit
            </Link>
          </DropdownMenuItem>
        )}
        {showPause &&
          (job.paused ? (
            <DropdownMenuItem onSelect={() => resume.mutate(job)}>
              <PlayIcon />
              Resume schedule
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => pause.mutate(job)}>
              <PauseIcon />
              Pause schedule
            </DropdownMenuItem>
          ))}
        {(showEdit || showPause) && <DropdownMenuSeparator />}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Run button plus a menu, for job rows. */
export function JobRowActions({ job }: { job: Job }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex gap-2">
      <RunButton job={job} />
      <MoreMenu
        job={job}
        showEdit
        showPause
        onDelete={() => setConfirming(true)}
      />
      <DeleteDialog job={job} open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}

/** Full action set for the job detail header. */
export function JobHeaderActions({ job }: { job: Job }) {
  const router = useRouter();
  const { pause, resume } = useJobActions();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {job.paused ? (
        <Button
          variant="outline"
          onClick={() => resume.mutate(job)}
          disabled={resume.isPending}
        >
          <PlayIcon />
          Resume
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => pause.mutate(job)}
          disabled={pause.isPending}
        >
          <PauseIcon />
          Pause
        </Button>
      )}
      <Button variant="outline" asChild>
        <Link href={`/jobs/edit?id=${job.id}`}>
          <PencilIcon />
          Edit
        </Link>
      </Button>
      <RunButton job={job} variant="default" resumeWhenPaused={false} />
      <MoreMenu
        job={job}
        showEdit={false}
        showPause={false}
        onDelete={() => setConfirming(true)}
      />
      <DeleteDialog
        job={job}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => router.push("/jobs")}
      />
    </div>
  );
}
