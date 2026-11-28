"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  CornerLeftUpIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { isInside, trimSlash } from "@/utils/paths";

interface FolderBrowserProps {
  /** Folder whose subfolders are listed. */
  path: string;
  root: string;
  onNavigate: (path: string) => void;
  /** Accessible name for the folder list. */
  label: string;
}

/**
 * Lists subfolders of `path`; entering a folder reports it via `onNavigate`,
 * so the folder you are in is the one selected.
 */
export default function FolderBrowser({
  path,
  root,
  onNavigate,
  label,
}: FolderBrowserProps) {
  const current = isInside(trimSlash(path), root) ? trimSlash(path) : root;
  const { data, error, isPending } = useQuery({
    queryKey: ["directories", current],
    queryFn: () => api.listDirectory(current),
    select: (dirs) => [...dirs].sort((a, b) => a.localeCompare(b)),
    retry: false,
  });

  const crumbs = current.slice(root.length).split("/").filter(Boolean);
  const rootName = root.split("/").pop() ?? root;
  const goTo = (depth: number) =>
    onNavigate([root, ...crumbs.slice(0, depth)].join("/"));

  return (
    <div className="overflow-hidden rounded-lg border">
      <nav
        aria-label={`${label}: location`}
        className="flex flex-wrap items-center gap-1 bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground"
      >
        <button
          type="button"
          onClick={() => goTo(0)}
          className="min-h-8 rounded px-1.5 text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          {rootName}
        </button>
        {crumbs.map((name, i) => (
          <span key={`${name}-${i}`} className="flex items-center gap-1">
            <ChevronRightIcon className="size-3" aria-hidden />
            {i === crumbs.length - 1 ? (
              <span className="px-1.5 text-foreground" aria-current="location">
                {name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => goTo(i + 1)}
                className="min-h-8 rounded px-1.5 text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              >
                {name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <ul aria-label={label} className="max-h-64 overflow-y-auto">
        {crumbs.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => goTo(crumbs.length - 1)}
              className="flex min-h-11 w-full items-center gap-2.5 border-t border-divider px-3 text-left text-sm text-muted-foreground outline-none hover:bg-hover-row focus-visible:bg-hover-row focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <CornerLeftUpIcon className="size-4" aria-hidden />
              Up one level
            </button>
          </li>
        )}
        {isPending ? (
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex h-11 items-center border-t border-divider px-3">
              <Skeleton className="h-4 w-40" />
            </li>
          ))
        ) : error ? (
          <li
            role="alert"
            className="border-t border-divider px-3 py-3 text-sm text-failed"
          >
            {errorMessage(error)}
          </li>
        ) : data.length === 0 ? (
          <li className="flex items-center gap-2 border-t border-divider px-3 py-3 text-sm text-muted-foreground">
            <FolderOpenIcon className="size-4" aria-hidden />
            No subfolders here.
          </li>
        ) : (
          data.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => onNavigate(`${current}/${name}`)}
                className="flex min-h-11 w-full items-center gap-2.5 border-t border-divider px-3 text-left text-sm outline-none hover:bg-hover-row focus-visible:bg-hover-row focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <FolderIcon className="size-4 shrink-0 text-link" aria-hidden />
                <span className="truncate">{name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
