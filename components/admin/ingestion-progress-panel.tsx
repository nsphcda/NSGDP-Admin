"use client";

import { useSyncExternalStore } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import type { IngestionProgress, IngestionStep } from "@/lib/api/ingestion-review";
import { HelpTip } from "@/components/admin/help-tip";
import { INGESTION_PROGRESS_TIP } from "@/lib/constants/dataset-tooltips";
import { cn } from "@/lib/utils";

/** One shared second-ticker so live elapsed labels stay pure during render. */
let clockMs = 0;
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;

function ensureClock() {
  if (typeof window === "undefined" || clockTimer != null) return;
  clockMs = Date.now();
  clockTimer = window.setInterval(() => {
    clockMs = Date.now();
    clockListeners.forEach((l) => l());
  }, 1000);
}

function subscribeClock(onStoreChange: () => void) {
  ensureClock();
  clockListeners.add(onStoreChange);
  return () => {
    clockListeners.delete(onStoreChange);
  };
}

function getClockSnapshot() {
  ensureClock();
  return clockMs;
}

function getClockServerSnapshot() {
  return 0;
}

function stepIcon(status: IngestionStep["status"]) {
  if (status === "completed" || status === "skipped") {
    return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }
  if (status === "failed") {
    return <X className="size-3.5 text-destructive" aria-hidden />;
  }
  if (status === "running") {
    return <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" aria-hidden />;
}

function isJobTerminal(progress: IngestionProgress): boolean {
  return progress.status === "failed" || progress.status === "cancelled";
}

/** When the job row is terminal, never show a stage as still running. */
function effectiveStepStatus(
  step: IngestionStep,
  jobTerminal: boolean,
): IngestionStep["status"] {
  if (jobTerminal && step.status === "running") return "failed";
  return step.status;
}

/** Compact wall-clock label: 45s, 3m 12s, 1h 04m. */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function stepDurationLabel(
  step: IngestionStep,
  nowMs: number,
  jobTerminal: boolean,
): string | null {
  if (!step.startedAt) return null;
  const start = Date.parse(step.startedAt);
  if (!Number.isFinite(start)) return null;
  const displayStatus = effectiveStepStatus(step, jobTerminal);
  const end =
    step.completedAt != null && Number.isFinite(Date.parse(step.completedAt))
      ? Date.parse(step.completedAt)
      : displayStatus === "running"
        ? nowMs
        : null;
  if (end == null) return null;
  return formatDurationMs(end - start);
}

function jobDurationLabel(progress: IngestionProgress, nowMs: number): string | null {
  const startIso = progress.startedAt ?? progress.createdAt;
  if (!startIso) return null;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const end =
    progress.completedAt != null && Number.isFinite(Date.parse(progress.completedAt))
      ? Date.parse(progress.completedAt)
      : progress.status === "pending" ||
          progress.status === "validating" ||
          progress.status === "processing"
        ? nowMs
        : null;
  if (end == null) return null;
  return formatDurationMs(end - start);
}

/** True when every stage finished successfully even if job status was later overwritten. */
function looksComplete(progress: IngestionProgress): boolean {
  if (progress.status === "completed") return true;
  if ((progress.progress ?? 0) < 100) return false;
  if (!progress.steps?.length) return false;
  return progress.steps.every(
    (s) => s.status === "completed" || s.status === "skipped"
  );
}

function queuedCaption(progress: IngestionProgress): string {
  const queue = progress.queue;
  if (!queue) return "Queued — waiting for a worker";
  const position =
    queue.ahead === 0 ? "next in line" : `${queue.ahead} ahead of this run`;
  if (queue.etaSeconds == null) return `Queued — ${position}`;
  const minutes = Math.max(1, Math.round(queue.etaSeconds / 60));
  return `Queued — ${position}, roughly ${minutes} min`;
}

function stageCaption(progress: IngestionProgress): string {
  if (progress.status === "pending") return queuedCaption(progress);
  if (looksComplete(progress)) {
    if (progress.status === "failed") {
      return "Ingestion finished — queue later reported a stall; workbook data was written";
    }
    return "Ingestion complete";
  }
  if (progress.status === "failed") {
    return progress.errorMessage ?? "Ingestion failed";
  }
  if (progress.status === "cancelled") return "Ingestion cancelled";
  const running = progress.steps.find((s) => s.status === "running");
  if (running) {
    const count =
      running.itemsTotal != null
        ? ` · ${running.itemsDone.toLocaleString()} / ${running.itemsTotal.toLocaleString()}`
        : running.itemsDone > 0
          ? ` · ${running.itemsDone.toLocaleString()}`
          : "";
    return `${running.label}${count}`;
  }
  return "Running";
}

interface IngestionProgressPanelProps {
  progress: IngestionProgress;
  /** Compact bar only — used on the dataset summary card. */
  compact?: boolean;
  className?: string;
}

export function IngestionProgressPanel({
  progress,
  compact = false,
  className,
}: IngestionProgressPanelProps) {
  const pct = Math.min(100, Math.max(0, progress.progress ?? 0));
  const complete = looksComplete(progress);
  const jobTerminal = isJobTerminal(progress);
  const trulyFailed = progress.status === "failed" && !complete;
  const active =
    !complete &&
    !jobTerminal &&
    (progress.status === "pending" ||
      progress.status === "validating" ||
      progress.status === "processing");
  const nowMs = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot
  );
  const totalElapsed = nowMs > 0 ? jobDurationLabel(progress, nowMs) : null;

  return (
    <section
      className={cn(
        compact ? "space-y-3" : "rounded-2xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline progress
            <HelpTip content={INGESTION_PROGRESS_TIP} label="About pipeline progress" />
          </p>
          <p className="text-sm text-foreground">{stageCaption(progress)}</p>
          {totalElapsed ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              Elapsed {totalElapsed}
            </p>
          ) : null}
        </div>
        <p className="text-lg font-bold tabular-nums tracking-tight">{pct}%</p>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Ingestion progress"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            trulyFailed
              ? "bg-destructive"
              : active
                ? "bg-primary"
                : "bg-emerald-600 dark:bg-emerald-500"
          )}
          style={{ width: `${progress.status === "pending" && pct === 0 ? 4 : pct}%` }}
        />
      </div>

      {!compact && (
        <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {progress.steps.map((step) => {
            const displayStatus = effectiveStepStatus(step, jobTerminal);
            const duration =
              nowMs > 0 || step.completedAt
                ? stepDurationLabel(step, nowMs, jobTerminal)
                : null;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]",
                  displayStatus === "running" && "border-primary/40 bg-primary/5",
                  displayStatus === "failed" && "border-destructive/40 bg-destructive/5"
                )}
              >
                <span className="mt-0.5 shrink-0">{stepIcon(displayStatus)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-5">{step.label}</span>
                    {duration ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {duration}
                      </span>
                    ) : null}
                  </span>
                  {step.message ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {step.message}
                    </span>
                  ) : null}
                  {displayStatus === "running" && step.itemsTotal != null ? (
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {step.itemsDone.toLocaleString()} / {step.itemsTotal.toLocaleString()}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
