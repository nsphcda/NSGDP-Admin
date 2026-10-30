"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  FileCheck,
  Globe,
  Lock,
  Database,
  Download,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ArchiveDatasetDialog } from "@/components/admin/archive-dataset-dialog";
import { BulkArchiveDatasetDialog } from "@/components/admin/bulk-archive-dataset-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/data/status-badge";
import { VisibilityBadge } from "@/components/data/visibility-badge";
import { AgeBadge } from "@/components/data/age-badge";
import { Pagination } from "@/components/data/pagination";
import { TableRowSkeleton } from "@/components/feedback/skeletons";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DataTableShell,
  METRIC_TONE,
  MetricCard,
  type MetricTone,
} from "@/components/admin/admin-analytics-ui";
import { ADMIN_TAB_PILL_ACTIVE, AdminTabCount } from "@/components/admin/admin-section-tabs-nav";
import { HelpTip } from "@/components/admin/help-tip";
import {
  DATASETS_QUEUE_METRIC_TIPS,
  DATASETS_QUEUE_PAGE_TIP,
  DATASETS_PUBLISH_TIP,
} from "@/lib/constants/datasets-queue-tooltips";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useAuth } from "@/lib/auth";
import { adminApi, archiveDataset, BULK_DOWNLOAD_MAX_DATASETS, bulkArchiveDatasets, bulkDownloadDatasets, publishDataset, unarchiveDataset, type ArchiveDatasetPayload } from "@/lib/api/admin";
import type { DatasetStatus } from "@/lib/api/datasets";
import type { Visibility } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import Link from "next/link";

interface Dataset {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: DatasetStatus;
  format: string;
  visibility: Visibility;
  owner_id: string;
  development_partner_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  analytics_published_at?: string | null;
}

interface DevelopmentPartner {
  id: string;
  name: string;
  slug: string;
}

interface DatasetPage {
  data: Dataset[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

type QueueTab = DatasetStatus | "all" | "published";
type QueueScope = "partners" | "platform-owner";

const TABS: Array<{ key: QueueTab; label: string; tone: MetricTone }> = [
  { key: "all", label: "All datasets", tone: "muted" },
  { key: "pending", label: "Pending", tone: "warning" },
  { key: "under_review", label: "Under review", tone: "info" },
  { key: "validated", label: "Validated", tone: "primary" },
  { key: "approved", label: "Approved", tone: "warning" },
  { key: "published", label: "Published", tone: "success" },
  { key: "rejected", label: "Rejected", tone: "destructive" },
  { key: "archived", label: "Archived", tone: "muted" },
];

const SCOPE_TABS: Array<{ key: QueueScope; label: string }> = [
  { key: "platform-owner", label: "Agency" },
  { key: "partners", label: "Dev Partners" },
];

async function fetchQueueCount(path: string, scope: QueueScope): Promise<number> {
  const response = await adminApi.get<{ data: DatasetPage }>(`${path}?page=1&limit=1&scope=${scope}`);
  return response.data.data.meta.total;
}

async function fetchStatusCount(
  status: DatasetStatus,
  scope: QueueScope,
  published?: boolean,
): Promise<number> {
  const params = new URLSearchParams({
    page: "1",
    limit: "1",
    status,
    scope,
  });
  if (published === true) params.set("published", "true");
  if (published === false) params.set("published", "false");
  const response = await adminApi.get<{ data: DatasetPage }>(
    `/admin/datasets?${params}`,
  );
  return response.data.data.meta.total;
}

export default function DatasetsReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isLoading: permissionsLoading, can, isSuperAdmin } = useAdminAccess();
  const { user } = useAuth();
  // Any staff can view the review queue — acting on a dataset (validate,
  // approve, publish, etc.) still requires the specific delegated permission,
  // checked separately below.
  const canViewQueue = isSuperAdmin || user?.role === "staff";
  const canValidate = can("validate:datasets");
  // Narrower than it used to be: only the final validated -> approved
  // decision (or sending a validated dataset back to under_review) —
  // everything upstream is now canValidate's job.
  const canApprove = can("approve:datasets");
  const canPublish = can("publish:datasets");
  const canArchive = can("archive:datasets");
  // Everyone who can open this queue may try; the server skips (and
  // reports) anything the caller is not allowed to download.
  const canDownload = canViewQueue;

  const [scope, setScope] = useState<QueueScope>("platform-owner");
  const [tab, setTab] = useState<QueueTab>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [archiveTarget, setArchiveTarget] = useState<Dataset | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  useEffect(() => {
    setSelectedSlugs(new Set());
  }, [scope, tab, page, debouncedQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const archiveMutation = useMutation({
    mutationFn: ({
      slug,
      payload,
    }: {
      slug: string;
      payload?: ArchiveDatasetPayload;
    }) => archiveDataset(slug, payload),
    onSuccess: () => {
      toast({ title: "Success", description: "Dataset archived" });
      setArchiveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] });
    },
    onError: (error: unknown) =>
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to archive dataset",
        variant: "destructive",
      }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (slug: string) => unarchiveDataset(slug),
    onSuccess: () => {
      toast({ title: "Success", description: "Dataset restored from archive" });
      setArchiveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] });
    },
    onError: (error: unknown) =>
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to restore dataset",
        variant: "destructive",
      }),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: (payload: { slugs: string[] } & ArchiveDatasetPayload) =>
      bulkArchiveDatasets(payload),
    onSuccess: (result) => {
      setBulkArchiveOpen(false);
      setSelectedSlugs(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] });

      const { succeeded, failed, analyticsRetractCount } = result;
      if (failed.length === 0) {
        toast({
          title: "Bulk archive complete",
          description:
            analyticsRetractCount > 0
              ? `${succeeded.length} archived; ${analyticsRetractCount} retracted from analytics.`
              : `${succeeded.length} dataset${succeeded.length === 1 ? "" : "s"} archived.`,
        });
        return;
      }

      toast({
        title: "Bulk archive finished with errors",
        description: `${succeeded.length} archived, ${failed.length} failed.${analyticsRetractCount > 0 ? ` ${analyticsRetractCount} retracted.` : ""}`,
        variant: failed.length === result.succeeded.length + result.failed.length ? "destructive" : "default",
      });
    },
    onError: (error: unknown) =>
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Bulk archive failed",
        variant: "destructive",
      }),
  });

  const bulkDownloadMutation = useMutation({
    mutationFn: (slugs: string[]) => bulkDownloadDatasets(slugs),
    onSuccess: (result) => {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const { includedCount, skipped } = result;
      if (skipped.length === 0) {
        toast({
          title: "Download ready",
          description: `${includedCount} dataset${includedCount === 1 ? "" : "s"} downloaded.`,
        });
        return;
      }
      const titleBySlug = new Map(datasets.map((d) => [d.slug, d.title]));
      const detail = skipped
        .slice(0, 3)
        .map((s) => `${titleBySlug.get(s.slug) ?? (s.slug || "A dataset")}: ${s.reason}`)
        .join(" ");
      toast({
        title: `${includedCount} downloaded, ${skipped.length} skipped`,
        description: `${detail}${skipped.length > 3 ? " …" : ""} Full list is in _download-report.json inside the ZIP.`,
      });
    },
    onError: (error: unknown) =>
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Bulk download failed",
        variant: "destructive",
      }),
  });

  const publishMutation = useMutation({
    mutationFn: (slug: string) => publishDataset(slug),
    onSuccess: () => {
      toast({ title: "Success", description: "Dataset published to the public catalogue" });
      queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] });
    },
    onError: (error: unknown) =>
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to publish dataset",
        variant: "destructive",
      }),
  });

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "datasets", "queue", scope, tab, debouncedQuery, page, pageSize],
    enabled: canViewQueue,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), scope });
      if (debouncedQuery) params.append("search", debouncedQuery);

      if (tab === "pending") {
        const response = await adminApi.get<{ data: DatasetPage }>(`/admin/review-queue?${params}`);
        return response.data.data;
      }
      if (tab === "under_review") {
        const response = await adminApi.get<{ data: DatasetPage }>(
          `/admin/review-queue/under-review?${params}`,
        );
        return response.data.data;
      }
      if (tab === "validated") {
        const response = await adminApi.get<{ data: DatasetPage }>(
          `/admin/review-queue/validated?${params}`,
        );
        return response.data.data;
      }
      if (tab === "published") {
        params.append("status", "approved");
        params.append("published", "true");
      } else if (tab !== "all") {
        params.append("status", tab);
        if (tab === "approved") {
          params.append("published", "false");
        }
      }
      const response = await adminApi.get<{ data: DatasetPage }>(`/admin/datasets?${params}`);
      return response.data.data;
    },
    placeholderData: keepPreviousData,
  });

  const [
    partnersPendingSummary,
    agencyPendingSummary,
    underReviewSummary,
    validatedSummary,
    approvedSummary,
    publishedSummary,
    rejectedSummary,
  ] = useQueries({
    queries: [
      {
        queryKey: ["admin", "datasets", "summary", "partners", "pending"],
        queryFn: () => fetchQueueCount("/admin/review-queue", "partners"),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", "platform-owner", "pending"],
        queryFn: () => fetchQueueCount("/admin/review-queue", "platform-owner"),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", scope, "under_review"],
        queryFn: () => fetchQueueCount("/admin/review-queue/under-review", scope),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", scope, "validated"],
        queryFn: () => fetchQueueCount("/admin/review-queue/validated", scope),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", scope, "approved"],
        queryFn: () => fetchStatusCount("approved", scope, false),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", scope, "published"],
        queryFn: () => fetchStatusCount("approved", scope, true),
        enabled: canViewQueue,
      },
      {
        queryKey: ["admin", "datasets", "summary", scope, "rejected"],
        queryFn: () => fetchStatusCount("rejected", scope),
        enabled: canViewQueue,
      },
    ],
  });

  const pendingSummary =
    scope === "partners" ? partnersPendingSummary : agencyPendingSummary;

  const scopePendingCount: Record<QueueScope, number> = {
    partners: partnersPendingSummary.data ?? 0,
    "platform-owner": agencyPendingSummary.data ?? 0,
  };

  const statsLoading =
    pendingSummary.isLoading ||
    underReviewSummary.isLoading ||
    validatedSummary.isLoading ||
    approvedSummary.isLoading ||
    publishedSummary.isLoading ||
    rejectedSummary.isLoading;

  const { data: developmentPartnersData } = useQuery({
    queryKey: ["admin", "development-partners"],
    queryFn: async () => {
      const response = await adminApi.get<{ data: { data: DevelopmentPartner[] } }>(
        "/admin/development-partners?page=1&limit=100",
      );
      return response.data.data;
    },
  });

  const datasets = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const isSearchPending = query.trim() !== debouncedQuery;
  const hasFilters = !!query || !!debouncedQuery || tab !== "pending";
  const showBulkArchive = canArchive && tab !== "archived";
  const showSelection = (canArchive || canDownload) && tab !== "archived";
  const selectableOnPage = showSelection
    ? datasets.filter((d) => d.status !== "archived")
    : [];
  const allPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((d) => selectedSlugs.has(d.slug));
  const selectedDatasets = datasets.filter((d) => selectedSlugs.has(d.slug));
  const selectedRestrictedCount = selectedDatasets.filter(
    (d) => d.visibility === "restricted",
  ).length;
  const overDownloadLimit = selectedSlugs.size > BULK_DOWNLOAD_MAX_DATASETS;
  const selectedAnalyticsCount = selectedDatasets.filter((d) =>
    Boolean(d.analytics_published_at),
  ).length;

  const toggleSelectAllOnPage = () => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        selectableOnPage.forEach((d) => next.delete(d.slug));
      } else {
        selectableOnPage.forEach((d) => next.add(d.slug));
      }
      return next;
    });
  };

  const toggleSelectSlug = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setTab("pending");
    setPage(1);
  };

  const orgName = (developmentPartnerId: string | null) => {
    const org = developmentPartnersData?.data?.find((o) => o.id === developmentPartnerId);
    return org?.name ?? "Unknown development partner";
  };

  const renderActions = (dataset: Dataset, mobile = false) => {
    // Review (pending/under_review) is the Validator's job now; Finalize
    // (validated) is the Approver's — two different capabilities, two
    // different destination pages.
    const isReviewable = dataset.status === "pending" || dataset.status === "under_review";
    const isFinalizable = dataset.status === "validated";
    const canActOnRow = (isReviewable && canValidate) || (isFinalizable && canApprove);
    const primaryHref = isReviewable && canValidate
      ? `/datasets/${dataset.slug}/review`
      : isFinalizable && canApprove
        ? `/datasets/${dataset.slug}/approve`
        : `/datasets/${dataset.slug}`;
    const primaryLabel = isReviewable && canValidate
      ? "Review"
      : isFinalizable && canApprove
        ? "Finalize"
        : "View";

    return (
      <div className={cn("flex items-center gap-1.5", mobile && "w-full")}>
        <Link
          href={primaryHref}
          className={cn(
            buttonVariants({
              variant: canActOnRow ? "default" : "outline",
              size: "sm",
            }),
            "gap-1.5",
            mobile && "h-11 flex-1",
          )}
        >
          <Eye className="size-3.5" aria-hidden="true" />
          {primaryLabel}
        </Link>
        {dataset.status === "approved" && !dataset.published_at && canPublish && (
          <div className={cn("inline-flex items-center gap-0.5", mobile && "flex-1")}>
            <Button
              size="sm"
              variant="outline"
              className={cn("gap-1.5", mobile && "h-11 flex-1")}
              onClick={() => publishMutation.mutate(dataset.slug)}
              disabled={publishMutation.isPending}
              aria-label={`Publish ${dataset.title}`}
            >
              <Globe className="size-3.5" aria-hidden="true" />
              Publish
            </Button>
            <HelpTip content={DATASETS_PUBLISH_TIP} label="About publish" />
          </div>
        )}
        {canArchive &&
          (dataset.status === "archived" ? (
            <Button
              size={mobile ? "default" : "icon-sm"}
              variant="ghost"
              className={mobile ? "size-11 shrink-0" : undefined}
              onClick={() => setArchiveTarget(dataset)}
              aria-label={`Restore ${dataset.title}`}
              title="Restore dataset"
            >
              <ArchiveRestore className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              size={mobile ? "default" : "icon-sm"}
              variant="ghost"
              className={mobile ? "size-11 shrink-0" : undefined}
              onClick={() => setArchiveTarget(dataset)}
              aria-label={`Archive ${dataset.title}`}
              title="Archive dataset"
            >
              <Archive className="size-4" aria-hidden="true" />
            </Button>
          ))}
      </div>
    );
  };

  if (!permissionsLoading && !canViewQueue) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="The review queue is visible to agency staff and super admins only."
        />
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Review Queue
            <HelpTip content={DATASETS_QUEUE_PAGE_TIP} label="About the review queue" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage dataset submissions through the approval pipeline
          </p>
        </div>
        {!isLoading && (
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium tabular-nums">
            {total} {total === 1 ? "dataset" : "datasets"}
          </Badge>
        )}
      </div>

      <div className="rounded-xl border bg-muted/30 p-1">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Queue scope">
          {SCOPE_TABS.map((s) => {
            const active = scope === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setScope(s.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                  active
                    ? ADMIN_TAB_PILL_ACTIVE
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                )}
              >
                {s.label}
                <AdminTabCount count={scopePendingCount[s.key]} active={active} />
              </button>
            );
          })}
        </div>
      </div>

      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            compact
            label="Pending review"
            value={pendingSummary.data ?? 0}
            hint="Awaiting first review"
            tip={DATASETS_QUEUE_METRIC_TIPS.pending}
            icon={FileCheck}
            tone="warning"
            active={tab === "pending"}
            onClick={() => { setTab("pending"); setPage(1); }}
          />
          <MetricCard
            compact
            label="Under review"
            value={underReviewSummary.data ?? 0}
            hint="Assigned to a reviewer"
            tip={DATASETS_QUEUE_METRIC_TIPS.under_review}
            icon={Database}
            tone="info"
            active={tab === "under_review"}
            onClick={() => { setTab("under_review"); setPage(1); }}
          />
          <MetricCard
            compact
            label="Validated"
            value={validatedSummary.data ?? 0}
            hint="Awaiting final approval"
            tip={DATASETS_QUEUE_METRIC_TIPS.validated}
            icon={CheckCircle2}
            tone="primary"
            active={tab === "validated"}
            onClick={() => { setTab("validated"); setPage(1); }}
          />
          <MetricCard
            compact
            label="Approved"
            value={approvedSummary.data ?? 0}
            hint="Ready to publish"
            tip={DATASETS_QUEUE_METRIC_TIPS.approved}
            icon={Globe}
            tone="warning"
            active={tab === "approved"}
            onClick={() => { setTab("approved"); setPage(1); }}
          />
          <MetricCard
            compact
            label="Published"
            value={publishedSummary.data ?? 0}
            hint="Live on catalogue"
            tip={DATASETS_QUEUE_METRIC_TIPS.published}
            icon={Globe}
            tone="success"
            active={tab === "published"}
            onClick={() => { setTab("published"); setPage(1); }}
          />
          <MetricCard
            compact
            label="Rejected"
            value={rejectedSummary.data ?? 0}
            hint="Returned to submitter"
            tip={DATASETS_QUEUE_METRIC_TIPS.rejected}
            icon={Archive}
            tone="destructive"
            active={tab === "rejected"}
            onClick={() => { setTab("rejected"); setPage(1); }}
          />
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-1">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Dataset status">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => {
                    setTab(t.key);
                    setPage(1);
                  }}
                  className={cn(
                    "min-h-9 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                    tab === t.key
                      ? ADMIN_TAB_PILL_ACTIVE
                      : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-sm">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search title, format or development partner"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 pl-9 pr-10"
                  aria-label="Search datasets"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-0 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {hasFilters && (
                <Button variant="ghost" className="h-10" onClick={clearFilters}>
                  <X className="size-4" aria-hidden="true" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              {(isSearchPending || (isFetching && !isLoading)) && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              )}
              <span>
                {isSearchPending ? "Searching" : isFetching && !isLoading ? "Updating" : "Found"}{" "}
                <span className="font-semibold tabular-nums text-foreground">{total}</span>{" "}
                {total === 1 ? "result" : "results"}
              </span>
            </div>
          </div>

          {showSelection && selectedSlugs.size > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                showBulkArchive
                  ? "border-destructive/20 bg-destructive/5"
                  : "border-border bg-muted/30",
              )}
            >
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{selectedSlugs.size}</span>{" "}
                selected
                {selectedRestrictedCount > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {selectedRestrictedCount} restricted (downloaded only if you have access)
                  </span>
                ) : null}
                {overDownloadLimit ? (
                  <span className="text-destructive">
                    {" "}
                    · download is limited to {BULK_DOWNLOAD_MAX_DATASETS} at a time
                  </span>
                ) : null}
                {selectedAnalyticsCount > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {selectedAnalyticsCount} loaded in analytics
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSlugs(new Set())}
                >
                  Clear
                </Button>
                {canDownload ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={overDownloadLimit || bulkDownloadMutation.isPending}
                    onClick={() => bulkDownloadMutation.mutate([...selectedSlugs])}
                  >
                    {bulkDownloadMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download className="size-3.5" aria-hidden="true" />
                    )}
                    Download selected
                  </Button>
                ) : null}
                {showBulkArchive ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setBulkArchiveOpen(true)}
                  >
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archive selected
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div aria-busy={isFetching || isSearchPending} className="space-y-4">
        {isError ? (
          <div className="rounded-2xl border bg-card px-4 py-12 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-7" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Could not load review queue</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Check your connection and try loading the dataset list again.
            </p>
            <Button variant="outline" className="mt-5 h-11 sm:h-8" onClick={() => refetch()}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <>
            <div className="hidden overflow-hidden rounded-2xl border bg-card xl:block">
              <Table>
                <TableBody>
                  {[...Array(6)].map((_, i) => (
                    <TableRowSkeleton key={i} cols={7} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:hidden">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          </>
        ) : datasets.length === 0 ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={Database}
              title={hasFilters ? "No matching datasets" : "Queue is empty"}
              description={
                hasFilters
                  ? "Try a different search term or status filter."
                  : "There are no datasets in this status."
              }
              action={hasFilters ? { label: "Clear filters", onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          <>
            <DataTableShell>
              <div className="hidden xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="h-11 bg-muted/40 text-[11px] uppercase tracking-wide hover:bg-muted/40">
                      {showSelection ? (
                        <TableHead className="h-11 w-10 px-3">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={toggleSelectAllOnPage}
                            aria-label="Select all datasets on this page"
                          />
                        </TableHead>
                      ) : null}
                      <TableHead className="h-11 px-4">Dataset</TableHead>
                      <TableHead className="h-11 px-4">Development Partner</TableHead>
                      <TableHead className="h-11 px-4">Format</TableHead>
                      <TableHead className="h-11 px-4">Visibility</TableHead>
                      <TableHead className="h-11 px-4">Status</TableHead>
                      <TableHead className="h-11 px-4">Submitted</TableHead>
                      <TableHead className="h-11 px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.map((dataset) => (
                      <TableRow key={dataset.id} className="hover:bg-muted/30">
                        {showSelection ? (
                          <TableCell className="w-10 px-3 py-3.5">
                            {dataset.status !== "archived" ? (
                              <Checkbox
                                checked={selectedSlugs.has(dataset.slug)}
                                onCheckedChange={() => toggleSelectSlug(dataset.slug)}
                                aria-label={`Select ${dataset.title}`}
                              />
                            ) : null}
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-sm px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Database className="size-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/datasets/${dataset.slug}`}
                                className="line-clamp-1 font-semibold hover:underline"
                              >
                                {dataset.title}
                              </Link>
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {dataset.description || "No description provided"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-48 px-4 py-3.5 text-muted-foreground">
                          <span className="line-clamp-2">{orgName(dataset.development_partner_id)}</span>
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <FormatBadge format={dataset.format} />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <VisibilityBadge visibility={dataset.visibility} />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          <StatusBadge status={dataset.status} publishedAt={dataset.published_at} />
                        </TableCell>
                        <TableCell className="px-4 py-3.5">
                          {dataset.status === "pending" || dataset.status === "under_review" || dataset.status === "validated" ? (
                            <AgeBadge submittedAt={dataset.submitted_at || dataset.created_at} />
                          ) : (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDate(dataset.submitted_at || dataset.created_at)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3.5 text-right">
                          {renderActions(dataset)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DataTableShell>

            <div className="grid grid-cols-1 gap-3 xl:hidden">
              {datasets.map((dataset) => (
                <article key={dataset.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    {showSelection && dataset.status !== "archived" ? (
                      <Checkbox
                        checked={selectedSlugs.has(dataset.slug)}
                        onCheckedChange={() => toggleSelectSlug(dataset.slug)}
                        aria-label={`Select ${dataset.title}`}
                        className="mt-1"
                      />
                    ) : null}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Database className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/datasets/${dataset.slug}`}
                        className="line-clamp-2 text-sm font-semibold leading-5 hover:underline"
                      >
                        {dataset.title}
                      </Link>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {orgName(dataset.development_partner_id)}
                      </p>
                    </div>
                    <StatusBadge
                      status={dataset.status}
                      publishedAt={dataset.published_at}
                      className="shrink-0"
                    />
                  </div>

                  {dataset.description && (
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {dataset.description}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-2 border-y py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Format
                      </p>
                      <div className="mt-1">
                        <FormatBadge format={dataset.format} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Visibility
                      </p>
                      <div className="mt-1 truncate">
                        <VisibilityBadge visibility={dataset.visibility} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Submitted
                      </p>
                      <div className="mt-1 truncate">
                        {dataset.status === "pending" || dataset.status === "under_review" || dataset.status === "validated" ? (
                          <AgeBadge submittedAt={dataset.submitted_at || dataset.created_at} />
                        ) : (
                          <p className="truncate text-xs font-medium">
                            {formatDate(dataset.submitted_at || dataset.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">{renderActions(dataset, true)}</div>
                </article>
              ))}
            </div>
          </>
        )}

        {!isLoading && datasets.length > 0 && (
          <Pagination
            page={page}
            totalPages={Math.max(1, totalPages)}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            className="rounded-xl border bg-card px-4 py-3"
          />
        )}
      </div>

      <ConfirmDialog
        open={!!archiveTarget && archiveTarget.status === "archived"}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Restore dataset?"
        description={`"${archiveTarget?.title}" will be restored to its previous workflow status.`}
        confirmLabel="Restore"
        loading={unarchiveMutation.isPending}
        onConfirm={() => {
          if (!archiveTarget) return;
          unarchiveMutation.mutate(archiveTarget.slug);
        }}
      />

      <ArchiveDatasetDialog
        open={!!archiveTarget && archiveTarget.status !== "archived"}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive dataset?"
        datasetTitle={archiveTarget?.title ?? "This dataset"}
        analyticsPublished={Boolean(archiveTarget?.analytics_published_at)}
        loading={archiveMutation.isPending}
        onConfirm={(payload) => {
          if (!archiveTarget) return;
          archiveMutation.mutate({ slug: archiveTarget.slug, payload });
        }}
      />

      <BulkArchiveDatasetDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        selectedCount={selectedSlugs.size}
        analyticsLoadedCount={selectedAnalyticsCount}
        loading={bulkArchiveMutation.isPending}
        onConfirm={(payload) => {
          bulkArchiveMutation.mutate({
            slugs: [...selectedSlugs],
            ...payload,
          });
        }}
      />
    </div>
    </TooltipProvider>
  );
}

function FormatBadge({ format }: { format: string | null | undefined }) {
  const t = METRIC_TONE.info;
  return (
    <Badge variant="outline" className={cn("rounded-full border text-[11px] font-semibold", t.well, t.icon)}>
      {format?.toUpperCase() || "?"}
    </Badge>
  );
}
