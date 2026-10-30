"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Calendar, Edit, Lock, MapPin, MoreVertical, RefreshCw, Target,
  Trash2, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useProgramBySlug, useArchiveProgram } from "@/lib/hooks/usePrograms";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { ProgramFormModal } from "@/components/admin/program-form-modal";
import { ProgramProgressModal } from "@/components/admin/program-progress-modal";
import { ProgramReportsCard } from "@/components/admin/program-reports-card";
import { HelpTip } from "@/components/admin/help-tip";
import { RichHtmlContent } from "@/components/admin/rich-html-content";
import { objectivesToEditorHtml } from "@/lib/objectives-html";
import {
  headlineProgressPercent,
  lgaCoverageCounts,
  lgaCoveragePercent,
  outcomeMetricPercent,
  tracksLgaCoverage,
  tracksOutcomeMetric,
  PROGRESS_MODE_OPTIONS,
} from "@/lib/constants/program-progress";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, daysActiveSince, daysUntilStart, daysUntilEnd } from "@/lib/utils/date";
import type { ProgrammeStatus } from "@/lib/api/programs";
import {
  PROGRAM_COVERAGE_PANEL_TIP,
  PROGRAM_DETAIL_METRIC_TIPS,
  PROGRAM_DETAIL_PAGE_TIP,
  PROGRAM_INFO_PANEL_TIP,
  PROGRAM_OBJECTIVES_PANEL_TIP,
  PROGRAM_PROGRESS_PANEL_TIP,
  PROGRAM_TIMELINE_PANEL_TIP,
  PROGRAM_UPDATE_PROGRESS_TIP,
} from "@/lib/constants/programs-tooltips";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/feedback/empty-state";

const statusColors: Record<ProgrammeStatus, string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  completed: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  suspended: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  archived: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

export default function ProgramDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { isLoading: permissionsLoading, can, canAny } = useAdminAccess();
  const canView = canAny("create:programs", "edit:programs", "upload:programs", "delete:programs");
  const canEdit = can("edit:programs");
  const canEditProgress = can("edit:programs");
  const canDelete = can("delete:programs");

  const [editOpen, setEditOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const programQuery = useProgramBySlug(slug);
  const archiveMutation = useArchiveProgram();

  const program = programQuery.data;
  const isLoading = programQuery.isLoading;
  const isError = programQuery.isError;

  const handleArchive = () => {
    archiveMutation.mutate(slug, {
      onSuccess: () => {
        toast.success("Programme archived");
        setArchiveOpen(false);
        router.push("/programs");
      },
      onError: (error) => {
        const err = error as { message?: string };
        toast.error(err?.message || "Failed to archive programme");
      },
    });
  };

  if (!permissionsLoading && !canView) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="Managing programmes requires create:programs, edit:programs, upload:programs, or delete:programs. Ask a super admin to grant your group one of these permissions."
        />
      </div>
    );
  }

  if (isLoading || permissionsLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border bg-card">
        <div className="text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Target className="size-8" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">Programme not found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The programme may have been removed or the URL may be incorrect.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => programQuery.refetch()}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
            <Link href="/programs" className={buttonVariants({ variant: "default" })}>
              <ArrowLeft className="size-4" />
              Back to programmes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const mode = program.progress_mode ?? "lga_coverage";
  const lgaCounts = lgaCoverageCounts(program);
  const lgaPct = lgaCoveragePercent(program);
  const outcomePct = outcomeMetricPercent(program);
  const headlinePct = headlineProgressPercent(program);
  const progressModeLabel =
    PROGRESS_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;

  // Calculate time-based metrics
  let timelineMetric: {
    label: string;
    value: string;
    description: string;
    durationText: string;
  } | null = null;
  let daysRemaining: number | null = null;

  if (program.status === "active") {
    const now = new Date();
    if (program.end_date) {
      daysRemaining = daysUntilEnd(program.end_date, now);
    }
    if (program.start_date) {
      const started = daysActiveSince(program.start_date, now);
      const untilStart = daysUntilStart(program.start_date, now);
      if (untilStart > 0) {
        timelineMetric = {
          label: "Starts in",
          value: untilStart.toString(),
          description:
            daysRemaining !== null
              ? `${daysRemaining} days until end`
              : "Scheduled — not started yet",
          durationText: `Starts in ${untilStart} day${untilStart === 1 ? "" : "s"}`,
        };
      } else {
        timelineMetric = {
          label: "Active days",
          value: started.toString(),
          description:
            daysRemaining !== null ? `${daysRemaining} days remaining` : "Ongoing",
          durationText: `${started} day${started === 1 ? "" : "s"} active`,
        };
      }
    }
  }

  return (
    <TooltipProvider delay={200}>
    <div className="space-y-5">
      <ProgramFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        programme={program}
      />
      <ProgramProgressModal
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        programme={program}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive programme?"
        description={`Archive "${program.name}"? It will be removed from the public catalogue but can be restored later.`}
        confirmLabel="Archive"
        variant="destructive"
        loading={archiveMutation.isPending}
        onConfirm={handleArchive}
      />

      {/* Header */}
      <header className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3 sm:px-5">
          <Link href="/programs" className={cn(buttonVariants({ variant: "ghost" }), "-ml-3 h-11 sm:h-8")}>
            <ArrowLeft className="size-4" />
            Programmes
          </Link>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
              <Target className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="flex items-center gap-2 text-2xl font-bold leading-8">
                  {program.name}
                  <HelpTip content={PROGRAM_DETAIL_PAGE_TIP} label="About this programme" />
                </h1>
                {program.code && <Badge variant="outline">{program.code}</Badge>}
                {program.type && (
                  <Badge variant="secondary" className="capitalize">
                    {program.type.replace("-", " ")}
                  </Badge>
                )}
                <Badge className={cn("capitalize", statusColors[program.status])}>
                  {program.status}
                </Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {program.description}
              </p>
            </div>
          </div>

          {(canEdit || canDelete || canEditProgress) && (
            <div className="flex flex-wrap gap-2">
              {canEditProgress && (
                <div className="flex items-center gap-1.5">
                  <Button
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                    onClick={() => setProgressOpen(true)}
                  >
                    <TrendingUp className="size-4" />
                    Update progress
                  </Button>
                  <HelpTip content={PROGRAM_UPDATE_PROGRESS_TIP} label="About update progress" />
                </div>
              )}
              {canEdit && (
                <Button
                  variant="outline"
                  className="h-11 flex-1 sm:h-9 sm:flex-none"
                  onClick={() => setEditOpen(true)}
                >
                  <Edit className="size-4" />
                  Edit
                </Button>
              )}
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-11 items-center justify-center rounded-md border px-4 sm:h-9">
                    <MoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setArchiveOpen(true)}
                      disabled={program.status === "archived"}
                    >
                      <Trash2 className="size-4" />
                      Archive programme
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Programme metrics">
        {tracksOutcomeMetric(mode) && program.target_count != null && (
          <MetricCard
            label="Outcome target"
            value={program.target_count.toLocaleString()}
            icon={Target}
            description={program.primary_metric || "Outcome metric"}
            tip={PROGRAM_DETAIL_METRIC_TIPS.outcomeTarget}
          />
        )}
        {tracksOutcomeMetric(mode) && program.reach_count !== null && (
          <MetricCard
            label="Outcome reached"
            value={program.reach_count.toLocaleString()}
            icon={TrendingUp}
            description={outcomePct != null ? `${outcomePct}% of target` : "In progress"}
            tip={PROGRAM_DETAIL_METRIC_TIPS.outcomeReached}
          />
        )}
        {tracksLgaCoverage(mode) && lgaCounts.target > 0 && (
          <MetricCard
            label="LGAs covered"
            value={String(lgaCounts.reach)}
            icon={MapPin}
            description={`of ${lgaCounts.target} target LGAs`}
            tip={PROGRAM_DETAIL_METRIC_TIPS.lgaCoverage}
          />
        )}
        {timelineMetric && (
          <MetricCard
            label={timelineMetric.label}
            value={timelineMetric.value}
            icon={Calendar}
            description={timelineMetric.description}
            tip={PROGRAM_DETAIL_METRIC_TIPS.timeline}
          />
        )}
      </section>

      {/* Progress Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <CardTitle className="flex items-center gap-2">
            Progress Overview
            <HelpTip content={PROGRAM_PROGRESS_PANEL_TIP} label="About progress overview" />
          </CardTitle>
          {canEditProgress && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProgressOpen(true)}
            >
              <TrendingUp className="size-4" />
              Update
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Tracking: {progressModeLabel}
          </p>

          {tracksLgaCoverage(mode) && lgaPct != null && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">LGA coverage</span>
                <span className="text-muted-foreground">
                  {lgaCounts.reach} / {lgaCounts.target} LGAs
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${lgaPct}%` }}
                />
              </div>
            </div>
          )}

          {tracksOutcomeMetric(mode) && outcomePct != null && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{program.primary_metric || "Outcome"}</span>
                <span className="text-muted-foreground">
                  {program.reach_count?.toLocaleString()} / {program.target_count?.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${outcomePct}%` }}
                />
              </div>
            </div>
          )}

          {headlinePct == null && (
            <p className="text-sm text-muted-foreground">
              No progress recorded yet.
              {canEditProgress ? " Use Update progress to mark coverage or reach." : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <ProgramReportsCard
        slug={program.slug}
        canUpload={can("upload:programs")}
        canDelete={canDelete}
      />

      {/* Details Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Programme Information */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              Programme Information
              <HelpTip content={PROGRAM_INFO_PANEL_TIP} label="About programme information" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <InfoRow label="Type" value={program.type ? program.type.replace("-", " ") : "Not specified"} />
            <InfoRow label="Status" value={program.status} className="capitalize" />
            <InfoRow label="Programme Code" value={program.code || "Not assigned"} />
            <InfoRow
              label="Development Partners"
              value={
                program.partners && program.partners.length > 0
                  ? program.partners.map((p) => p.name).join(", ")
                  : "None assigned"
              }
            />
            <InfoRow label="Created" value={formatDate(program.created_at)} />
            <InfoRow label="Last Updated" value={formatDate(program.updated_at)} />
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              Timeline
              <HelpTip content={PROGRAM_TIMELINE_PANEL_TIP} label="About timeline" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <InfoRow
              label="Start Date"
              value={program.start_date ? formatDate(program.start_date) : "Not set"}
            />
            <InfoRow
              label="End Date"
              value={program.end_date ? formatDate(program.end_date) : "Not set"}
            />
            {timelineMetric && (
              <InfoRow label="Duration" value={timelineMetric.durationText} />
            )}
            {daysRemaining !== null && program.status === "active" && (
              <InfoRow
                label="Time Remaining"
                value={daysRemaining === 0 ? "Ends today" : `${daysRemaining} days`}
              />
            )}
          </CardContent>
        </Card>

        {/* Coverage */}
        {program.target_lgas && program.target_lgas.length > 0 && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                Geographic Coverage
                <HelpTip content={PROGRAM_COVERAGE_PANEL_TIP} label="About geographic coverage" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <InfoRow
                  label="Target LGAs"
                  value={`${program.target_lgas.length} LGAs`}
                />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Target LGAs:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {program.target_lgas.map((lga) => (
                      <Badge
                        key={lga}
                        variant={
                          program.covered_lgas?.includes(lga) ? "default" : "secondary"
                        }
                      >
                        {lga}
                        {program.covered_lgas?.includes(lga) ? " · covered" : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Objectives */}
        {program.objectives && program.objectives.length > 0 && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                Objectives
                <HelpTip content={PROGRAM_OBJECTIVES_PANEL_TIP} label="About objectives" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <RichHtmlContent html={objectivesToEditorHtml(program.objectives)} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  tip,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  description?: string;
  tip?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
              {tip ? <HelpTip content={tip} label={`About ${label}`} /> : null}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium", className)}>{value}</span>
    </div>
  );
}
