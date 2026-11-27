"use client";

import { useEffect, useId, useState } from "react";
import { FolderIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { listDirectory } from "@/app/api";
import { isInside, trimSlash } from "@/utils/paths";

interface FolderFieldProps {
  label: string;
  value: string;
  root: string;
  onChange: (path: string) => void;
  hint?: string;
}

export default function FolderField({
  label,
  value,
  root,
  onChange,
  hint,
}: FolderFieldProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(root);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDirectory(`${current}/`)
      .then((dirs) => {
        if (!cancelled) setFolders([...dirs].sort());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFolders([]);
        setError(e instanceof Error ? e.message : "Can't open this folder");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, current]);

  const openBrowser = () => {
    // The typed path may not exist yet (new destination), so start from the
    // closest parent we can list; failures fall back to the root in the UI.
    const start = trimSlash(value);
    setCurrent(isInside(start, root) ? start : root);
    setOpen(true);
  };

  const crumbs = trimSlash(current)
    .slice(root.length)
    .split("/")
    .filter(Boolean);
  const rootName = root.split("/").pop() ?? root;

  const goTo = (depth: number) =>
    setCurrent([root, ...crumbs.slice(0, depth)].join("/"));

  return (
    <div
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-300"
      >
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          required
          className="block w-full min-w-0 rounded-md border-gray-600 bg-gray-700 font-mono text-sm text-gray-100"
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openBrowser())}
          aria-expanded={open}
          className="shrink-0 rounded-md bg-gray-700 px-3 text-sm text-gray-200 hover:bg-gray-600"
        >
          {open ? "Hide" : "Browse"}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}

      {open && (
        <div className="mt-2 rounded-md border border-gray-600 bg-gray-900/60">
          <nav
            aria-label="Folder path"
            className="flex flex-wrap items-center gap-1 border-b border-gray-700 px-3 py-2 text-sm"
          >
            <button
              type="button"
              onClick={() => goTo(0)}
              className="text-blue-400 hover:text-blue-300"
            >
              {rootName}
            </button>
            {crumbs.map((name, i) => (
              <span key={`${name}-${i}`} className="flex items-center gap-1">
                <ChevronRightIcon className="h-3 w-3 text-gray-500" />
                {i === crumbs.length - 1 ? (
                  <span className="text-gray-200" aria-current="page">
                    {name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(i + 1)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {name}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-3 text-sm text-gray-400">Loading...</p>
            ) : error ? (
              <div className="px-3 py-3 text-sm text-red-300">
                {error}{" "}
                <button
                  type="button"
                  onClick={() => setCurrent(root)}
                  className="underline"
                >
                  Back to {rootName}
                </button>
              </div>
            ) : folders.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">
                No subfolders here.
              </p>
            ) : (
              <ul>
                {folders.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setCurrent(`${trimSlash(current)}/${name}`)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700"
                    >
                      <FolderIcon className="h-4 w-4 text-gray-400" />
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-700 px-3 py-2">
            <span className="truncate font-mono text-xs text-gray-400">
              {current}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(current);
                setOpen(false);
              }}
              className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Select this folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
