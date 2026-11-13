"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Activity, BarChart3, CheckCircle2, Database, GitBranch, Link2, Loader2, ShieldAlert, Sparkles, TrendingUp, XCircle, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  useAiSpend,
  useRunCalibration,
  useRunShiftDetection,
  useRunChangepointScan,
  useRunRelationMatch,
  useSuccessionCandidates,
  useConfirmSuccession,
  useRejectSuccession,
  useChangepoints,
  useConfirmChangepoint,
  useRejectChangepoint,
  useConflictDatasetSummaries,
} from "@/lib/hooks/useIngestionOps";
import {
  useBackfillIngestion,
  useReviewQueue,
} from "@/lib/hooks/useIngestionReview";
import { DataReviewQueueTab } from "@/components/admin/data-review-queue-tab";
import { IndicatorsRegistryTab } from "@/components/admin/indicators-registry-tab";
import { DatasetCompareTab } from "@/components/admin/dataset-compare-tab";
import { ConflictsTab } from "@/components/admin/conflicts-tab";
import { AnalyticsWarehouseTab } from "@/components/admin/analytics-warehouse-tab";
import { PipelineTab } from "@/components/admin/pipeline-tab";
import { IngestionMetricsTab } from "@/components/admin/ingestion-metrics-tab";
import { IngestionOpsTabsNav } from "@/components/admin/ingestion-ops-tabs-nav";
import { useAfterDelay } from "@/lib/hooks/useStaggeredEnable";
import {
  IngestionOpsGuideButton,
} from "@/components/admin/ingestion-ops-help-panel";
import {
  IngestionOpsHelpFab,
  IngestionOpsTabHelpDialog,
} from "@/components/admin/ingestion-ops-tab-help-dialog";
import { IngestionOpsHelpDialog } from "@/components/admin/ingestion-ops-help-dialog";
import type { IngestionOpsTabId } from "@/lib/constants/ingestion-ops-help";
import { HelpTip } from "@/components/admin/help-tip";
import {
  AI_SPEND_TIPS,
  INGESTION_OPS_BACKFILL_TIP,
  INGESTION_OPS_PAGE_TIP,
  METRICS_CARD_TIPS,
  STAGE8_TIPS,
} from "@/lib/constants/ingestion-ops-tooltips";
import { MetricCard, Panel, DataTableShell, type MetricTone } from "@/components/admin/admin-analytics-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const OPS_TABS = [
  "observability",
  "pipeline",
  "aliases",
  "conflicts",
  "indicators",
  "warehouse",
  "compare",
  "ai-spend",
  "stage8",
] as const;

type OpsTab = (typeof OPS_TABS)[number];

function parseOpsTab(value: string | null): OpsTab {
  if (value === "active") return "pipeline";
  if (value === "calibration") return "stage8";
  if (value && (OPS_TABS as readonly string[]).includes(value)) {
    return value as OpsTab;
  }
  return "observability";
}

function AiSpendTab() {
  const { data, isLoading } = useAiSpend(7);

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <EmptyState title="No AI spend data available" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cost (7d)"
          value={`$${data.totalCostUsd.toFixed(2)}`}
          tip={AI_SPEND_TIPS.cost}
          icon={Sparkles}
          tone="destructive"
        />
        <MetricCard
          label="Tokens (7d)"
          value={data.totalTokens.toLocaleString()}
          tip={AI_SPEND_TIPS.tokens}
          icon={Database}
          tone="info"
        />
        <MetricCard
          label="Cache hit rate"
          value={`${Math.round(data.cacheHitRate * 100)}%`}
          tip={METRICS_CARD_TIPS.cache_hit_rate}
          icon={Zap}
          tone="success"
        />
        <MetricCard
          label="Circuit breaker"
          value={data.circuit.open ? "Open" : "Closed"}
          tip={METRICS_CARD_TIPS.circuit_breaker}
          icon={Activity}
          tone={data.circuit.open ? "warning" : "muted"}
        />
      </div>

      <Panel title="Spend by task" icon={Sparkles} tone="destructive">
        {data.byTask.length === 0 ? (
          <EmptyState title="No AI calls in this period" />
        ) : (
          <DataTableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cache hits</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Acceptance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byTask.map((t) => (
                  <TableRow key={t.task}>
                    <TableCell className="font-medium">{t.task}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.cacheHits}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.skipped}</TableCell>
                    <TableCell className="text-right tabular-nums">${t.costUsd.toFixed(3)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.acceptanceRate != null ? `${Math.round(t.acceptanceRate * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        )}
      </Panel>
    </div>
  );
}

function SuccessionCandidatesList() {
  const { data: candidates, isLoading } = useSuccessionCandidates("pending");
  const confirmMutation = useConfirmSuccession();
  const rejectMutation = useRejectSuccession();

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!candidates || candidates.length === 0) {
    return <p className="text-xs text-muted-foreground">No pending succession candidates.</p>;
  }

  return (
    <div className="space-y-2">
      {candidates.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 text-sm">
            <p className="truncate">
              <span className="font-medium">{c.predecessorName}</span>
              {" → "}
              <span className="font-medium">{c.successorName}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              embedding similarity {c.embeddingSimilarity}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                confirmMutation.mutate(c.id, {
                  onSuccess: () => toast.success("Succession confirmed"),
                  onError: (error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Failed to confirm"),
                })
              }
              disabled={confirmMutation.isPending}
            >
              <CheckCircle2 className="size-4" />
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                rejectMutation.mutate(c.id, {
                  onSuccess: () => toast.success("Succession rejected"),
                  onError: (error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Failed to reject"),
                })
              }
              disabled={rejectMutation.isPending}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangepointsList() {
  const { data: points, isLoading } = useChangepoints("pending");
  const confirmMutation = useConfirmChangepoint();
  const rejectMutation = useRejectChangepoint();

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!points || points.length === 0) {
    return <p className="text-xs text-muted-foreground">No pending changepoints.</p>;
  }

  return (
    <div className="space-y-2">
      {points.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">
              {p.indicatorName} · {p.periodYear}
              {p.periodMonth != null ? `-${String(p.periodMonth).padStart(2, "0")}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {p.method} · {Math.round(Number(p.lgaShare) * 100)}% of LGAs affected
              {p.note ? ` · ${p.note}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                confirmMutation.mutate(p.id, {
                  onSuccess: () => toast.success("Changepoint confirmed"),
                  onError: (error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Failed to confirm"),
                })
              }
              disabled={confirmMutation.isPending}
            >
              <CheckCircle2 className="size-4" />
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                rejectMutation.mutate(p.id, {
                  onSuccess: () => toast.success("Changepoint rejected"),
                  onError: (error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Failed to reject"),
                })
              }
              disabled={rejectMutation.isPending}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stage8ToolsTab() {
  const shiftMutation = useRunShiftDetection();
  const changepointMutation = useRunChangepointScan();
  const relationMutation = useRunRelationMatch();
  const calibrationMutation = useRunCalibration();

  const tools: {
    icon: typeof TrendingUp;
    title: string;
    description: string;
    titleTip: string;
    mutation: ReturnType<typeof useRunShiftDetection>;
    label: string;
    list: React.ReactNode;
    tone: MetricTone;
  }[] = [
    {
      icon: TrendingUp,
      title: "Alias succession scan",
      description: "Finds an indicator likely replaced by another (name changed, form revised).",
      titleTip: STAGE8_TIPS.succession,
      mutation: shiftMutation,
      label: "Run Shift Detection",
      list: <SuccessionCandidatesList />,
      tone: "primary",
    },
    {
      icon: GitBranch,
      title: "Changepoint scan",
      description: "Flags a reporting-regime shift shared across most LGAs, so it reads as a form change, not an outbreak.",
      titleTip: STAGE8_TIPS.changepoint,
      mutation: changepointMutation,
      label: "Run Changepoint Scan",
      list: <ChangepointsList />,
      tone: "warning",
    },
    {
      icon: Link2,
      title: "Cross-dataset relation matching",
      description: "Finds the same study reported by a different development partner under different naming. Confirm/reject from each dataset's Related Datasets tab.",
      titleTip: STAGE8_TIPS.relations,
      mutation: relationMutation,
      label: "Run Relation Matching",
      list: null,
      tone: "info",
    },
  ];

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <span>
          Scans run on a schedule (succession nightly, changepoint weekly, calibration
          quarterly). Use the buttons to run one immediately. Pending succession and
          changepoint candidates appear below each scan; relation candidates are actioned
          from each dataset&apos;s Related Datasets tab.
        </span>
        <HelpTip content={STAGE8_TIPS.intro} label="About Stage 8 scans" className="mt-0.5" />
      </p>
      {tools.map((tool) => (
        <Panel
          key={tool.title}
          title={tool.title}
          titleTip={tool.titleTip}
          description={tool.description}
          icon={tool.icon}
          tone={tool.tone}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                tool.mutation.mutate(undefined, {
                  onError: (error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Scan failed"),
                })
              }
              disabled={tool.mutation.isPending}
            >
              {tool.mutation.isPending ? "Running..." : tool.label}
            </Button>
          }
        >
          {tool.mutation.data != null && (
            <p className="mb-3 text-xs font-medium text-primary">
              Last run: {tool.mutation.data} candidate(s) written
            </p>
          )}
          {tool.list}
        </Panel>
      ))}

      <Panel
        title="Embedding calibration"
        titleTip={STAGE8_TIPS.calibration}
        description="Sweeps auto-accept/review thresholds against confirmed alias pairs. Runs quarterly on a schedule — safe to re-run; updated bands apply after review."
        icon={TrendingUp}
        tone="primary"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              calibrationMutation.mutate(undefined, {
                onError: (error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Calibration failed"),
              })
            }
            disabled={calibrationMutation.isPending}
          >
            <Sparkles className="size-4" />
            {calibrationMutation.isPending ? "Running..." : "Run calibration"}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tunes how strict indicator name matching is (auto-accept vs send to alias review).
        </p>
        {calibrationMutation.data ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Auto threshold"
              value={calibrationMutation.data.autoThreshold}
              tip={STAGE8_TIPS.auto_threshold}
              icon={Zap}
              tone="success"
            />
            <MetricCard
              label="Auto precision"
              value={`${Math.round(calibrationMutation.data.autoPrecision * 100)}%`}
              icon={CheckCircle2}
              tone="info"
            />
            <MetricCard
              label="Review threshold"
              value={calibrationMutation.data.reviewThreshold}
              tip={STAGE8_TIPS.review_threshold}
              icon={TrendingUp}
              tone="warning"
            />
            <MetricCard
              label="Pairs evaluated"
              value={calibrationMutation.data.pairs}
              icon={Database}
              tone="muted"
            />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export default function IngestionOpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { can, isSuperAdmin } = useAdminAccess();
  const canView = can("manage:indicators");
  const backfillMutation = useBackfillIngestion();
  const tab = parseOpsTab(searchParams.get("tab"));

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "queue-health") {
      router.replace("/system-health?tab=queues");
      return;
    }
    if (raw === "dead-letter") {
      router.replace("/system-health?tab=dead-letter");
      return;
    }
    if (raw === "ai-spend" && !isSuperAdmin) {
      router.replace("/ingestion-ops");
    }
  }, [router, searchParams, isSuperAdmin]);

  const setTab = (value: string) => {
    const next = parseOpsTab(value);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "observability") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `/ingestion-ops?${qs}` : "/ingestion-ops");
  };
  // Only the tab badges use these two lists, so they start a moment after the page's own
  // requests instead of in the same burst.
  const badgeCountsReady = useAfterDelay(1500);
  const { data: globalAliases } = useReviewQueue(undefined, {
    global: true,
    limit: 200,
    enabled: canView && badgeCountsReady,
  });
  const { data: conflictSummaries } = useConflictDatasetSummaries({
    enabled: canView && badgeCountsReady,
  });
  const pendingAliasCount = globalAliases?.length ?? 0;
  const openConflictCount =
    conflictSummaries?.reduce((sum, row) => sum + row.openConflicts, 0) ?? 0;
  const [guideOpen, setGuideOpen] = useState(false);
  const [tabHelpOpen, setTabHelpOpen] = useState(false);

  const visibleGuideTabs: IngestionOpsTabId[] = [
    "observability",
    "pipeline",
    "aliases",
    "conflicts",
    "indicators",
    "warehouse",
    ...(isSuperAdmin
      ? (["compare", "ai-spend", "stage8"] as IngestionOpsTabId[])
      : []),
  ];

  if (!canView) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No access"
        description="You don't have permission to view ingestion operations."
      />
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              Ingestion Ops
              <HelpTip content={INGESTION_OPS_PAGE_TIP} label="About Ingestion Ops" />
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Pipeline health, alias review, indicator registry, analytics warehouse, and published-dataset compare.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IngestionOpsGuideButton onClick={() => setGuideOpen(true)} />
            {isSuperAdmin && (
              <div className="flex items-center gap-1.5">
                <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={backfillMutation.isPending}
                onClick={() =>
                  backfillMutation.mutate(50, {
                    onSuccess: (result) =>
                      toast.success(
                        `Catch-up: ${result.enqueued} enqueued, ${result.alreadyQueued} already queued, ${result.skipped} skipped (${result.scanned} scanned)`
                      ),
                    onError: (error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : "Backfill failed"
                      ),
                  })
                }
              >
                {backfillMutation.isPending ? "Backfilling…" : "Backfill catch-up"}
                </Button>
                <HelpTip
                  content={INGESTION_OPS_BACKFILL_TIP}
                  label="About backfill catch-up"
                />
              </div>
            )}
          </div>
        </div>

        <IngestionOpsHelpDialog
          open={guideOpen}
          onOpenChange={setGuideOpen}
          initialTab={tab}
          visibleTabs={visibleGuideTabs}
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <IngestionOpsTabsNav
          isSuperAdmin={isSuperAdmin}
          pendingAliasCount={pendingAliasCount}
          openConflictCount={openConflictCount}
          activeTab={tab}
        />
        <TabsContent value="pipeline" className="mt-0">
          <PipelineTab />
        </TabsContent>
        <TabsContent value="aliases" className="mt-0" keepMounted>
          <DataReviewQueueTab global />
        </TabsContent>
        <TabsContent value="conflicts" className="mt-0">
          <ConflictsTab />
        </TabsContent>
        <TabsContent value="indicators" className="mt-0">
          <IndicatorsRegistryTab />
        </TabsContent>
        <TabsContent value="warehouse" className="mt-0">
          <AnalyticsWarehouseTab />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="compare" className="mt-0">
            <DatasetCompareTab />
          </TabsContent>
        )}
        <TabsContent value="observability" className="mt-0">
          <IngestionMetricsTab />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="ai-spend" className="mt-0">
            <AiSpendTab />
          </TabsContent>
        )}
        {isSuperAdmin && (
          <TabsContent value="stage8" className="mt-0">
            <Stage8ToolsTab />
          </TabsContent>
        )}
      </Tabs>

        <IngestionOpsTabHelpDialog
          open={tabHelpOpen}
          onOpenChange={setTabHelpOpen}
          tab={tab}
        />
        <IngestionOpsHelpFab tab={tab} onClick={() => setTabHelpOpen(true)} />
      </div>
    </TooltipProvider>
  );
}
