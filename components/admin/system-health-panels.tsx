"use client";

import {
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  Server,
  Cog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  DataTableShell,
  MetricCard,
  Panel,
} from "@/components/admin/admin-analytics-ui";
import { HelpTip } from "@/components/admin/help-tip";
import { QueueActions } from "@/components/admin/queue-actions";
import {
  SYSTEM_HEALTH_DEPENDENCIES_TIP,
  SYSTEM_HEALTH_QUEUE_TIPS,
} from "@/lib/constants/system-health-tooltips";
import type { QueuesHealth } from "@/lib/api/ingestion-ops";
import type { DependencyHealth, SystemHealthSnapshot } from "@/lib/api/system-health";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

const DEPENDENCY_ICONS = {
  api: Server,
  postgres: Database,
  redis: Activity,
  object_storage: HardDrive,
  workers: Cog,
} as const;

function toneForStatus(status: DependencyHealth["status"] | QueuesHealth["status"]) {
  if (status === "healthy") return "success" as const;
  if (status === "degraded") return "warning" as const;
  return "destructive" as const;
}

function statusLabel(status: DependencyHealth["status"] | QueuesHealth["status"]) {
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Degraded";
  return "Unavailable";
}

export function SystemDependenciesPanel({
  snapshot,
  isLoading,
}: {
  snapshot?: SystemHealthSnapshot;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!snapshot) {
    return <EmptyState title="Could not load dependency health" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Overall status"
          value={statusLabel(snapshot.status)}
          hint={`${snapshot.environment} · ${formatDate(snapshot.checkedAt)}`}
          tip={SYSTEM_HEALTH_DEPENDENCIES_TIP}
          icon={CheckCircle2}
          tone={toneForStatus(snapshot.status)}
        />
        {snapshot.dependencies.map((dep) => {
          const Icon = DEPENDENCY_ICONS[dep.id];
          return (
            <MetricCard
              key={dep.id}
              label={dep.label}
              value={statusLabel(dep.status)}
              hint={
                dep.latencyMs != null
                  ? `${dep.latencyMs}ms`
                  : dep.detail ?? "No latency sample"
              }
              tip={dep.detail ?? undefined}
              icon={Icon}
              tone={toneForStatus(dep.status)}
            />
          );
        })}
      </div>

      {snapshot.warnings.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/[0.08] p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-warning" />
            <ul className="space-y-1">
              {snapshot.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function QueueHealthPanel({
  data,
  isLoading,
}: {
  data?: QueuesHealth;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <EmptyState title="No queue health data available" />;

  const totalWaiting = data.queues.reduce((s, q) => s + q.waiting, 0);
  const totalActive = data.queues.reduce((s, q) => s + q.active, 0);
  const totalFailed = data.queues.reduce((s, q) => s + q.failed, 0);
  const workers = data.workers ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Queue status"
          value={data.status === "healthy" ? "Healthy" : "Degraded"}
          hint={`Checked ${formatDate(data.checkedAt)}`}
          tip={SYSTEM_HEALTH_QUEUE_TIPS.overview}
          icon={CheckCircle2}
          tone={data.status === "healthy" ? "success" : "warning"}
        />
        <MetricCard
          label="Waiting jobs"
          value={totalWaiting}
          tip={SYSTEM_HEALTH_QUEUE_TIPS.waiting}
          icon={Clock}
          tone="warning"
        />
        <MetricCard
          label="Failed jobs"
          value={totalFailed}
          tip={SYSTEM_HEALTH_QUEUE_TIPS.failed}
          icon={AlertTriangle}
          tone="destructive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Workers"
          description={
            workers.length === 0
              ? "No worker heartbeat seen. Nothing is consuming queues."
              : `${workers.length} worker process(es) reporting.`
          }
          icon={Cog}
          tone={workers.length === 0 ? "warning" : "success"}
        >
          {workers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Uploads, emails and ingestion are not being processed. Check that
              the worker container is running.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {workers.map((w) => (
                <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{w.id}</span>
                  <span className="text-muted-foreground tabular-nums">
                    up {formatUptime(w.uptimeSeconds)} · {w.rssMb} MB RSS ·{" "}
                    {w.heapUsedMb} MB heap ·{" "}
                    <span
                      className={cn(
                        w.eventLoopLagMs > 500 && "font-semibold text-destructive",
                      )}
                    >
                      {w.eventLoopLagMs} ms lag
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Queue Redis"
          description={
            data.redis
              ? `Checked ${formatDate(data.redis.checkedAt)}`
              : "No reading yet."
          }
          icon={Database}
          tone={
            data.redis && (data.redis.errors.length > 0 || data.redis.warnings.length > 0)
              ? "warning"
              : "success"
          }
        >
          {data.redis ? (
            <div className="space-y-2 text-sm">
              <p>
                Policy{" "}
                <Badge
                  variant="outline"
                  className={cn(
                    data.redis.snapshot.policy !== "noeviction" &&
                      "border-destructive/40 text-destructive",
                  )}
                >
                  {data.redis.snapshot.policy ?? "unknown"}
                </Badge>{" "}
                · {formatMb(data.redis.snapshot.usedBytes)} of{" "}
                {data.redis.snapshot.maxBytes > 0
                  ? formatMb(data.redis.snapshot.maxBytes)
                  : "no limit"}{" "}
                · {data.redis.snapshot.evictedKeys} evicted
              </p>
              {[...data.redis.errors, ...data.redis.warnings].map((m) => (
                <p key={m} className="text-destructive">
                  {m}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The first reading arrives within a few minutes of boot.
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Queue breakdown"
        titleTip={SYSTEM_HEALTH_QUEUE_TIPS.overview}
        description={`${totalActive} job(s) active across ${data.queues.length} queue(s). Dead letter: ${data.deadLetterCount}.`}
        icon={Activity}
        tone="success"
      >
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Oldest waiting</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.queues.map((q) => (
                <TableRow key={q.queue}>
                  <TableCell className="font-medium">{q.queue}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.waiting}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.active}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      q.failed > 0 && "font-semibold text-destructive",
                    )}
                  >
                    {q.failed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.oldestWaitingAgeMs != null
                      ? `${Math.round(q.oldestWaitingAgeMs / 1000)}s`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {q.paused ? (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning/10 text-amber-700 dark:text-warning"
                      >
                        Paused
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/10 text-success"
                      >
                        Running
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <QueueActions queue={q.queue} paused={q.paused} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      </Panel>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1048576)} MB`;
}

export function SystemHealthRefreshing({ refreshing }: { refreshing: boolean }) {
  if (!refreshing) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      Refreshing
    </span>
  );
}
