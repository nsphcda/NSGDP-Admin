"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Copy,
  GitCompare,
} from "lucide-react";
import { useDatasetCompareProfile } from "@/lib/hooks/useGovernance";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/admin/admin-analytics-ui";
import { COMPARE_TAB_TIP } from "@/lib/constants/ingestion-ops-tooltips";
import { DatasetPicker } from "@/components/admin/dataset-picker";
import type { Dataset } from "@/lib/api/datasets";
import type {
  DatasetCompareProfile,
  DatasetCompareProfileResult,
  DatasetSimilarityVerdict,
} from "@/lib/api/admin";
import { cn } from "@/lib/utils";

const VERDICTS: Record<
  DatasetSimilarityVerdict,
  { label: string; hint: string; icon: typeof Copy; className: string }
> = {
  likely_duplicate: {
    label: "Likely duplicate",
    hint: "These two describe the same underlying data. Keep one, archive the other, or confirm them as related.",
    icon: Copy,
    className: "border-destructive/40 bg-destructive/5 text-destructive",
  },
  overlapping: {
    label: "Overlapping",
    hint: "Partly the same scope. Check the period and indicator differences before merging or archiving.",
    icon: CircleAlert,
    className:
      "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  different: {
    label: "Different datasets",
    hint: "Little in common. No action needed.",
    icon: CircleCheck,
    className:
      "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  },
};

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function period(p: DatasetCompareProfile): string {
  if (!p.periodStart && !p.periodEnd) return "—";
  const s = p.periodStart ? new Date(p.periodStart).getFullYear() : null;
  const e = p.periodEnd ? new Date(p.periodEnd).getFullYear() : null;
  if (s && e) return s === e ? String(s) : `${s}–${e}`;
  return String(s ?? e);
}

function listSummary(values: string[]): string {
  if (values.length === 0) return "—";
  const head = values.slice(0, 4).join(", ");
  return values.length > 4 ? `${head} +${values.length - 4} more` : head;
}

interface Row {
  label: string;
  a: string;
  b: string;
}

function buildRows(a: DatasetCompareProfile, b: DatasetCompareProfile): Row[] {
  const content = (
    p: DatasetCompareProfile,
    f: (c: NonNullable<DatasetCompareProfile["content"]>) => string,
  ) => (p.content ? f(p.content) : "Not ingested");
  return [
    { label: "Partner", a: a.partner ?? "—", b: b.partner ?? "—" },
    {
      label: "Department",
      a: a.responsibleDept ?? "—",
      b: b.responsibleDept ?? "—",
    },
    { label: "Format", a: a.format.toUpperCase(), b: b.format.toUpperCase() },
    { label: "Version", a: `v${a.version}`, b: `v${b.version}` },
    { label: "Review status", a: a.status, b: b.status },
    {
      label: "Ingestion",
      a: a.ingestionStatus.replace(/_/g, " "),
      b: b.ingestionStatus.replace(/_/g, " "),
    },
    { label: "Coverage period", a: period(a), b: period(b) },
    {
      label: "Published",
      a: fmtDate(a.publishedAt),
      b: fmtDate(b.publishedAt),
    },
    {
      label: "Indicators (declared)",
      a: listSummary(a.indicators),
      b: listSummary(b.indicators),
    },
    {
      label: "Geography (declared)",
      a: listSummary(a.geography),
      b: listSummary(b.geography),
    },
    { label: "Tags", a: listSummary(a.tags), b: listSummary(b.tags) },
    {
      label: "Warehouse rows",
      a: content(a, (c) => c.rows.toLocaleString()),
      b: content(b, (c) => c.rows.toLocaleString()),
    },
    {
      label: "Warehouse indicators",
      a: content(a, (c) => String(c.indicators)),
      b: content(b, (c) => String(c.indicators)),
    },
    {
      label: "Warehouse LGAs",
      a: content(a, (c) => String(c.lgas)),
      b: content(b, (c) => String(c.lgas)),
    },
    {
      label: "Warehouse years",
      a: content(a, (c) =>
        c.yearMin == null
          ? "—"
          : c.yearMin === c.yearMax
            ? String(c.yearMin)
            : `${c.yearMin}–${c.yearMax}`,
      ),
      b: content(b, (c) =>
        c.yearMin == null
          ? "—"
          : c.yearMin === c.yearMax
            ? String(c.yearMin)
            : `${c.yearMin}–${c.yearMax}`,
      ),
    },
    {
      label: "Completeness",
      a: content(a, (c) => pct(c.completeness)),
      b: content(b, (c) => pct(c.completeness)),
    },
  ];
}

function VerdictCard({ result }: { result: DatasetCompareProfileResult }) {
  const verdict = VERDICTS[result.similarity.verdict];
  const Icon = verdict.icon;
  const scored = result.similarity.components.filter((c) => c.score !== null);
  const skipped = result.similarity.components.filter((c) => c.score === null);
  return (
    <div className={cn("rounded-2xl border p-4", verdict.className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Icon className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-tight">
            {verdict.label}
            <span className="ml-2 text-sm font-normal opacity-80">
              {pct(result.similarity.score)} similar
            </span>
          </p>
          <p className="mt-0.5 text-sm text-foreground/80">{verdict.hint}</p>
        </div>
        {result.relationStatus && (
          <Badge variant="outline">Relation: {result.relationStatus}</Badge>
        )}
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {scored.map((c) => (
          <li key={c.key} className="text-sm text-foreground">
            <div className="mb-1 flex justify-between">
              <span>{c.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {pct(c.score)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-current"
                style={{ width: `${Math.round((c.score ?? 0) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Not scored (missing on one or both sides):{" "}
          {skipped.map((c) => c.label).join(", ")}.
        </p>
      )}
    </div>
  );
}

export function DatasetCompareTab() {
  const [pickedA, setPickedA] = useState<Dataset | null>(null);
  const [pickedB, setPickedB] = useState<Dataset | null>(null);

  const compare = useDatasetCompareProfile(pickedA?.id, pickedB?.id);
  const result = compare.data;
  const rows = result ? buildRows(result.datasetA, result.datasetB) : [];

  return (
    <div className="space-y-4">
      <Panel
        title="Compare two datasets"
        titleTip={COMPARE_TAB_TIP}
        description="Pick two datasets to see how similar they are, what differs, and whether one is a duplicate of the other. Works for every dataset; warehouse figures appear only for ingested ones."
        icon={GitCompare}
        tone="info"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <DatasetPicker
            label="Dataset A"
            value={pickedA}
            onChange={setPickedA}
            excludeId={pickedB?.id}
          />
          <DatasetPicker
            label="Dataset B"
            value={pickedB}
            onChange={setPickedB}
            excludeId={pickedA?.id}
          />
        </div>
      </Panel>

      {!pickedA || !pickedB ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <CircleHelp className="size-4" />
          Choose a dataset on both sides to compare.
        </p>
      ) : null}

      {compare.isLoading && pickedA && pickedB && (
        <Skeleton className="h-64 rounded-2xl" />
      )}

      {compare.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Compare failed. One of the datasets may have been deleted.
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <>
          <VerdictCard result={result} />

          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-[22%] px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">
                    A ·{" "}
                    <span className="normal-case">{result.datasetA.title}</span>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    B ·{" "}
                    <span className="normal-case">{result.datasetB.title}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const differs = row.a !== row.b;
                  return (
                    <tr
                      key={row.label}
                      className={cn(
                        "border-t align-top",
                        differs && "bg-amber-500/5",
                      )}
                    >
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {row.label}
                      </th>
                      <td className="break-words px-3 py-2">{row.a}</td>
                      <td className="break-words px-3 py-2">{row.b}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.shared ? (
            <div className="rounded-2xl border p-4 text-sm">
              <p className="font-medium">Shared in the warehouse</p>
              <p className="mt-1 text-muted-foreground">
                {result.shared.indicators} indicators, {result.shared.lgas} LGAs
                and {result.shared.years} years in common. {result.shared.keys}{" "}
                identical data points ({pct(result.shared.coverageOverlap)}{" "}
                overlap)
                {result.shared.conflicts > 0
                  ? `, ${result.shared.conflicts} with different values.`
                  : "."}
              </p>
              {result.shared.keys === 0 &&
                result.datasetA.content &&
                result.datasetB.content && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Zero identical points is expected when conflict resolution
                    already moved contested rows to one winner.
                  </p>
                )}
            </div>
          ) : (
            <p className="px-1 text-sm text-muted-foreground">
              Neither dataset has rows in the warehouse, so only metadata was
              compared.
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Next:{" "}
            <Link
              href="/ingestion-ops?tab=conflicts"
              className="text-primary underline-offset-4 hover:underline"
            >
              review value conflicts
            </Link>
            {" · "}
            <Link
              href="/governance"
              className="text-primary underline-offset-4 hover:underline"
            >
              Data Governance
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
