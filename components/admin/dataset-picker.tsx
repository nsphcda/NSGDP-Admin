"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { getDatasets, type Dataset } from "@/lib/api/datasets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function coverageLabel(d: Dataset): string | null {
  const start = d.temporal_coverage_start?.slice(0, 4);
  const end = d.temporal_coverage_end?.slice(0, 4);
  if (start && end) return start === end ? start : `${start}–${end}`;
  return start ?? end ?? null;
}

function DatasetMeta({ dataset }: { dataset: Dataset }) {
  const coverage = coverageLabel(dataset);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Badge variant="secondary" className="uppercase">
        {dataset.format}
      </Badge>
      {coverage && <span>{coverage}</span>}
      <span>v{dataset.version}</span>
      {dataset.responsible_dept && (
        <span className="truncate">{dataset.responsible_dept}</span>
      )}
    </div>
  );
}

interface DatasetPickerProps {
  label: string;
  value: Dataset | null;
  onChange: (dataset: Dataset | null) => void;
  /** Dataset already chosen in the other picker; shown but not selectable. */
  excludeId?: string;
}

/**
 * Searchable dataset picker: server-side search over approved datasets,
 * results with format/coverage/version, and a selected-dataset card.
 * Replaces a flat <select>, which stops scaling past a few dozen entries.
 */
export function DatasetPicker({
  label,
  value,
  onChange,
  excludeId,
}: DatasetPickerProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(!value);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setLimit(PAGE_SIZE);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["datasets", "picker", debounced, limit],
    queryFn: () =>
      getDatasets({
        status: "approved",
        search: debounced || undefined,
        limit,
        sortBy: "title",
        sortOrder: "ASC",
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: open,
  });

  const results = data?.data ?? [];
  // Backend nests pagination under `meta`; the shared PaginatedResponse type
  // declares a top-level `total`, which is undefined at runtime for datasets.
  const total =
    (data as { meta?: { total?: number } } | undefined)?.meta?.total ??
    data?.total ??
    results.length;
  const hasMore = results.length < total;

  const select = (d: Dataset) => {
    onChange(d);
    setOpen(false);
  };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Done" : "Change"}
          </Button>
        )}
      </div>

      {value && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{value.title}</p>
            <DatasetMeta dataset={value} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange(null);
              setOpen(true);
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {open && (
        <div className={cn("space-y-2", value && "mt-3")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved datasets by title…"
              className="pl-8"
              aria-label={`Search ${label}`}
            />
            {isFetching && (
              <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <ul
            className="max-h-64 space-y-1 overflow-y-auto pr-1"
            role="listbox"
            aria-label={label}
          >
            {results.map((d) => {
              const taken = d.id === excludeId;
              const selected = d.id === value?.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={taken}
                    onClick={() => select(d)}
                    className={cn(
                      "w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "border-primary/40 bg-primary/5",
                      taken &&
                        "cursor-not-allowed opacity-50 hover:bg-transparent",
                    )}
                  >
                    <p className="line-clamp-2 text-sm leading-snug">
                      {d.title}
                    </p>
                    <DatasetMeta dataset={d} />
                    {taken && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Already chosen on the other side
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
            {!isFetching && results.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                {isError
                  ? "Could not load datasets."
                  : debounced
                    ? `No approved datasets match “${debounced}”.`
                    : "No approved datasets."}
              </li>
            )}
          </ul>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {results.length} of {total} datasets
            </span>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={isFetching}
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
              >
                Load more
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
