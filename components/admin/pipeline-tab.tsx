"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MetricCard,
  Panel,
  DataTableShell,
  type MetricTone,
} from "@/components/admin/admin-analytics-ui";
import { HelpTip } from "@/components/admin/help-tip";
import {
  PIPELINE_ATTENTION_TIPS,
  PIPELINE_ISSUE_TIPS,
  PIPELINE_VIEW_TIPS,
} from "@/lib/constants/ingestion-ops-tooltips";
import {
  IN_FLIGHT_JOBS_KEY,
  PIPELINE_ATTENTION_KEY,
  PIPELINE_COMPLETED_KEY,
  useInFlightIngestionJobs,
  usePipelineAttention,
  usePipelineCompleted,
} from "@/lib/hooks/useIngestionReview";
import type { PipelineAttentionFilter } from "@/lib/api/ingestion-review";
import { runDatasetIngestion } from "@/lib/api/ingestion-review";
import {
  INGESTION_STATUS_LABEL,
  type IngestionStatus,
} from "@/lib/utils/ingestion-status";
import { formatDate } from "@/lib/utils/date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PipelineView = "running" | "completed" | "needs_attention";

const VIEW_OPTIONS: { value: PipelineView; label: string; tip: string }[] = [
  { value: "running", label: "Running", tip: PIPELINE_VIEW_TIPS.running },
  { value: "completed", label: "Completed", tip: PIPELINE_VIEW_TIPS.completed },
  {
    value: "needs_attention",
    label: "Needs attention",
    tip: PIPELINE_VIEW_TIPS.needs_attention,
  },
];

const ATTENTION_SUBFILTERS: {
  value: PipelineAttentionFilter;
  label: string;
  tip: string;
}[] = [
  { value: "all", label: "All", tip: PIPELINE_ATTENTION_TIPS.all },
  { value: "failed", label: "Failed", tip: PIPELINE_ATTENTION_TIPS.failed },
  {
    value: "incomplete",
    label: "Incomplete",
    tip: PIPELINE_ATTENTION_TIPS.incomplete,
  },
];

const KIND_LABEL = {
  failed: "Failed",
  not_started: "Not started",
  stuck: "Stuck",
  queued: "Queued",
} as const;

function jobStatusLabel(status: string): string {
  if (status === "pending") return "Queued";
  if (status === "validating") return "Validating";
  if (status === "processing") return "Running";
  return status;
}

function kindBadgeClass(kind: keyof typeof KIND_LABEL): string {
  switch (kind) {
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "stuck":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    case "queued":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    default:
      return "";
  }
}

function orgLabel(name: string | null, acronym: string | null): string {
  if (acronym && name) return `${acronym} — ${name}`;
  return name ?? acronym ?? "—";
}

export function PipelineTab() {
  const [view, setView] = useState<PipelineView>("running");
  const [attentionFilter, setAttentionFilter] =
    useState<PipelineAttentionFilter>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // All three stay warm so switching views is instant (no skeleton flash) and
  // the panel doesn't reflow while a freshly-enabled query loads. While any job
  // is in flight the outcome tabs poll fast so a row moving between tabs shows
  // up right away.
  const runningQuery = useInFlightIngestionJobs();
  const anyJobRunning = (runningQuery.data?.length ?? 0) > 0;
  const completedQuery = usePipelineCompleted({ activePoll: anyJobRunning });
  const attentionQuery = usePipelineAttention(attentionFilter, {
    activePoll: anyJobRunning,
  });

  const invalidatePipeline = () => {
    queryClient.invalidateQueries({ queryKey: [PIPELINE_ATTENTION_KEY] });
    queryClient.invalidateQueries({ queryKey: [PIPELINE_COMPLETED_KEY] });
    queryClient.invalidateQueries({ queryKey: [IN_FLIGHT_JOBS_KEY] });
  };

  const retryMutation = useMutation({
    mutationFn: ({
      datasetId,
      force,
    }: {
      datasetId: string;
      force?: boolean;
    }) => runDatasetIngestion(datasetId, { force }),
    onMutate: ({ datasetId }) => setRetryingId(datasetId),
    onSettled: () => setRetryingId(null),
    onSuccess: (result) => {
      if (result.action === "enqueued") {
        toast.success(
          "Ingestion enqueued — switch to Running to track progress",
        );
        setView("running");
      } else if (result.action === "already_queued") {
        toast.info("Ingestion is already queued");
        setView("running");
      } else {
        toast.warning(result.reason ?? "Ingestion was not enqueued");
      }
      invalidatePipeline();
      // The worker may take a beat to claim the job — nudge the in-flight list
      // a couple more times so it appears without waiting for the poll.
      window.setTimeout(
        () => queryClient.invalidateQueries({ queryKey: [IN_FLIGHT_JOBS_KEY] }),
        2000,
      );
      window.setTimeout(
        () => queryClient.invalidateQueries({ queryKey: [IN_FLIGHT_JOBS_KEY] }),
        5000,
      );
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to run ingestion",
      ),
  });

  const runningCount = runningQuery.data?.length ?? 0;
  const attentionSummary = attentionQuery.data?.summary;
  const completedSummary = completedQuery.data?.summary;
  const isRunningView = view === "running";
  const isCompletedView = view === "completed";
  const isAttentionView = view === "needs_attention";
  const activeQuery = isRunningView
    ? runningQuery
    : isCompletedView
      ? completedQuery
      : attentionQuery;
  const isLoading = activeQuery.isLoading;

  type MetricSpec = {
    label: string;
    value: number;
    icon: LucideIcon;
    tone: MetricTone;
    tip?: string;
  };
  const metricCards: MetricSpec[] = isRunningView
    ? [
        {
          label: "Running now",
          value: runningCount,
          icon: Loader2,
          tone: "info",
        },
      ]
    : isCompletedView
      ? [
          {
            label: "Ready for review",
            value: completedSummary?.readyForReview ?? 0,
            icon: CheckCircle2,
            tone: "info",
          },
          {
            label: "Published",
            value: completedSummary?.published ?? 0,
            icon: CheckCircle2,
            tone: "success",
          },
          {
            label: "Retracted",
            value: completedSummary?.retracted ?? 0,
            icon: RotateCcw,
            tone: "warning",
          },
        ]
      : [
          {
            label: "Failed",
            value: attentionSummary?.failed ?? 0,
            icon: Activity,
            tone: "destructive",
            tip: PIPELINE_ISSUE_TIPS.failed,
          },
          {
            label: "Not started",
            value: attentionSummary?.notStarted ?? 0,
            icon: RotateCcw,
            tone: "warning",
            tip: PIPELINE_ISSUE_TIPS.not_started,
          },
          {
            label: "Stuck",
            value: attentionSummary?.stuck ?? 0,
            icon: Loader2,
            tone: "warning",
            tip: PIPELINE_ISSUE_TIPS.stuck,
          },
          {
            label: "Queued",
            value: attentionSummary?.queued ?? 0,
            icon: RotateCcw,
            tone: "info",
            tip: PIPELINE_ISSUE_TIPS.queued,
          },
        ];

  return (
    <div className="space-y-4">
      {/* Fixed one-row height so the panel below doesn't jump between views. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: metricCards.length }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))
          : metricCards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                tone={card.tone}
                tip={card.tip}
              />
            ))}
      </div>

      <Panel
        title="Canonicalization pipeline"
        titleTip={PIPELINE_VIEW_TIPS[view]}
        description={
          isRunningView
            ? "Workbook uploads queued or running through the Reader pipeline."
            : isCompletedView
              ? "Analytics-shaped datasets whose canonicalization has finished. Blank templates and line lists are hidden."
              : "Datasets where canonicalization failed, stalled, or never started. Retry before loading into analytics."
        }
        icon={GitBranch}
        tone="info"
        action={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
              {VIEW_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className="inline-flex items-center gap-0.5"
                >
                  <Button
                    size="sm"
                    variant={view === opt.value ? "secondary" : "ghost"}
                    className="h-8"
                    onClick={() => setView(opt.value)}
                  >
                    {opt.label}
                    {opt.value === "running" && runningCount > 0 ? (
                      <span className="ml-1.5 rounded-full bg-info/15 px-1.5 text-[10px] font-semibold tabular-nums text-info">
                        {runningCount}
                      </span>
                    ) : null}
                  </Button>
                  <HelpTip content={opt.tip} label={`About ${opt.label}`} />
                </div>
              ))}
            </div>
            {/* Kept mounted (hidden when not on Needs attention) so the panel
                body below keeps a constant offset across views. */}
            <div
              className={cn(
                "flex flex-wrap gap-1 rounded-lg border bg-muted/20 p-1",
                !isAttentionView && "invisible pointer-events-none",
              )}
              aria-hidden={!isAttentionView}
            >
              {ATTENTION_SUBFILTERS.map((opt) => (
                <div
                  key={opt.value}
                  className="inline-flex items-center gap-0.5"
                >
                  <Button
                    size="sm"
                    variant={
                      attentionFilter === opt.value ? "secondary" : "ghost"
                    }
                    className="h-7 text-xs"
                    tabIndex={isAttentionView ? undefined : -1}
                    onClick={() => setAttentionFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                  <HelpTip content={opt.tip} label={`About ${opt.label}`} />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <div
          className={cn(
            "min-h-64 transition-opacity",
            activeQuery.isFetching && !isLoading && "opacity-60",
          )}
        >
          {isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : isRunningView ? (
            !runningQuery.data?.length ? (
              <EmptyState
                title="Nothing queued or running"
                description="When datasets are submitted for review or catch-up is run, active canonicalization jobs appear here."
              />
            ) : (
              <DataTableShell>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Progress</TableHead>
                      <TableHead>Queued</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runningQuery.data.map((job) => {
                      const pct = Math.min(100, Math.max(0, job.progress ?? 0));
                      const stage =
                        job.steps.find((s) => s.status === "running")?.label ??
                        (job.status === "pending" ? "Waiting for worker" : "—");
                      const href = job.datasetSlug
                        ? `/datasets/${job.datasetSlug}/ingestion`
                        : null;

                      return (
                        <TableRow key={job.jobId}>
                          <TableCell className="max-w-70">
                            {href ? (
                              <Link
                                href={href}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {job.datasetTitle ??
                                  job.datasetId ??
                                  "Unknown dataset"}
                              </Link>
                            ) : (
                              <span className="font-medium">
                                {job.datasetTitle ??
                                  job.datasetId ??
                                  "Unknown dataset"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1.5 text-[10px] uppercase",
                                job.status === "processing" &&
                                  "border-info/30 bg-info/10 text-info",
                                job.status === "pending" &&
                                  "border-warning/30 bg-warning/10 text-amber-700 dark:text-warning",
                              )}
                            >
                              {(job.status === "processing" ||
                                job.status === "validating") && (
                                <Loader2
                                  className="size-3 animate-spin"
                                  aria-hidden
                                />
                              )}
                              {jobStatusLabel(job.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[13px] text-muted-foreground">
                            {stage}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="ml-auto flex w-28 flex-col items-end gap-1">
                              <span className="text-xs font-semibold tabular-nums">
                                {pct}%
                              </span>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-500",
                                    job.status === "processing"
                                      ? "bg-info"
                                      : "bg-primary",
                                    job.status === "pending" &&
                                      pct === 0 &&
                                      "min-w-1",
                                  )}
                                  style={{
                                    width: `${job.status === "pending" && pct === 0 ? 4 : pct}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatDate(job.createdAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </DataTableShell>
            )
          ) : isCompletedView ? (
            !completedQuery.data?.items.length ? (
              <EmptyState
                title="Nothing completed yet"
                description="Datasets appear here once their canonicalization run finishes — ready for review, published, or retracted."
              />
            ) : (
              <DataTableShell>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Development Partner</TableHead>
                      <TableHead>Ingestion status</TableHead>
                      <TableHead>Last run</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedQuery.data.items.map((row) => (
                      <TableRow key={row.datasetId}>
                        <TableCell className="max-w-70">
                          <Link
                            href={`/datasets/${row.slug}/ingestion`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {row.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {orgLabel(
                            row.organisationName,
                            row.organisationAcronym,
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5",
                              row.ingestionStatus === "published" &&
                                "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                              row.ingestionStatus === "retracted" &&
                                "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
                            )}
                          >
                            <CheckCircle2 className="size-3" aria-hidden />
                            {INGESTION_STATUS_LABEL[
                              row.ingestionStatus as IngestionStatus
                            ] ?? row.ingestionStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="space-y-0.5">
                            {row.lastJobStage ? (
                              <p className="capitalize">{row.lastJobStage}</p>
                            ) : null}
                            {row.lastJobAt ? (
                              <p className="text-xs">
                                {formatDate(row.lastJobAt)}
                              </p>
                            ) : (
                              "—"
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.analyticsPublishedAt ? (
                            <span className="text-emerald-700 dark:text-emerald-300">
                              Loaded {formatDate(row.analyticsPublishedAt)}
                            </span>
                          ) : row.warehouseEligible ? (
                            <span className="text-amber-800 dark:text-amber-200">
                              Ready to load
                            </span>
                          ) : (
                            <div className="space-y-0.5 text-muted-foreground">
                              <p>
                                {row.pendingAliases === 0 &&
                                row.publishableRows === 0 &&
                                row.fitnessVerdict !== "rejected_unusable" &&
                                row.catalogueStatus === "approved"
                                  ? "Nothing to load"
                                  : "Not ready"}
                              </p>
                              <p className="text-xs">
                                {row.pendingAliases > 0
                                  ? `${row.pendingAliases.toLocaleString()} alias decision${row.pendingAliases === 1 ? "" : "s"} pending`
                                  : row.fitnessVerdict === "rejected_unusable"
                                    ? "not an analytics grid"
                                    : row.catalogueStatus !== "approved"
                                      ? "awaiting catalogue approval"
                                      : row.publishableRows === 0
                                        ? "no indicator values in this file, nothing to fix"
                                        : `${row.publishableRows.toLocaleString()} resolvable rows`}
                              </p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/datasets/${row.slug}`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <FileText className="size-3.5" />
                              <span className="sr-only">Open dataset page</span>
                            </Link>
                            <Link
                              href={`/datasets/${row.slug}/ingestion`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                              <span className="sr-only">Open ingestion</span>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableShell>
            )
          ) : !attentionQuery.data?.items.length ? (
            <EmptyState
              title="No ingestion issues"
              description="Failed or incomplete canonicalization jobs appear here. Running jobs stay under Running."
            />
          ) : (
            <DataTableShell>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset</TableHead>
                    <TableHead>Development Partner</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Last job</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attentionQuery.data.items.map((row) => {
                    const isRetrying = retryingId === row.datasetId;
                    return (
                      <TableRow key={row.datasetId}>
                        <TableCell>
                          <div className="space-y-1">
                            <Link
                              href={`/datasets/${row.slug}/ingestion`}
                              className="font-medium hover:underline"
                            >
                              {row.title}
                            </Link>
                            {row.lastJobError ? (
                              <p className="max-w-sm truncate text-xs text-destructive">
                                {row.lastJobError}
                              </p>
                            ) : row.blockReason ? (
                              <p className="max-w-sm truncate text-xs text-muted-foreground">
                                {row.blockReason}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {orgLabel(
                            row.organisationName,
                            row.organisationAcronym,
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "w-fit",
                                kindBadgeClass(row.attentionKind),
                              )}
                            >
                              {KIND_LABEL[row.attentionKind]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {INGESTION_STATUS_LABEL[
                                row.ingestionStatus as IngestionStatus
                              ] ?? row.ingestionStatus}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.lastJobStatus ? (
                            <div className="space-y-0.5">
                              <p className="capitalize">{row.lastJobStatus}</p>
                              {row.lastJobStage ? (
                                <p className="text-xs">{row.lastJobStage}</p>
                              ) : null}
                              {row.lastJobAt ? (
                                <p className="text-xs">
                                  {formatDate(row.lastJobAt)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/datasets/${row.slug}/ingestion`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                              <span className="sr-only">Open ingestion</span>
                            </Link>
                            {row.canRetry ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isRetrying}
                                onClick={() =>
                                  retryMutation.mutate({
                                    datasetId: row.datasetId,
                                    // A failed run can leave a completed job row
                                    // holding the file's idempotency key — force
                                    // so the retry actually re-enqueues.
                                    force: row.attentionKind === "failed",
                                  })
                                }
                              >
                                {isRetrying ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-3.5" />
                                )}
                                Retry
                              </Button>
                            ) : null}
                            {row.canForceRetry ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isRetrying}
                                onClick={() =>
                                  retryMutation.mutate({
                                    datasetId: row.datasetId,
                                    force: true,
                                  })
                                }
                              >
                                Force re-run
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DataTableShell>
          )}
          {isAttentionView &&
          attentionQuery.data &&
          attentionQuery.data.total > attentionQuery.data.items.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {attentionQuery.data.items.length} of{" "}
              {attentionQuery.data.total} datasets.
            </p>
          ) : null}
          {isCompletedView &&
          completedQuery.data &&
          completedQuery.data.total > completedQuery.data.items.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {completedQuery.data.items.length} of{" "}
              {completedQuery.data.total} datasets.
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
