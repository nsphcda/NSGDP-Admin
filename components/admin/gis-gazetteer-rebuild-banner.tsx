"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import { useGisJobStatus } from "@/lib/hooks/useGisReference";
import { GIS_SLOT_LABELS, type GisReferenceSlot } from "@/lib/api/gis-reference";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface GisPendingUpload {
  slot: GisReferenceSlot;
  fileName: string;
  percent: number;
}

export interface GisPendingRebuild {
  jobId: string;
  slot: GisReferenceSlot;
}

export const GIS_PENDING_REBUILD_KEY = "gis-pending-rebuild";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued — waiting for background worker",
  loading: "Loading GIS files",
  truncate: "Clearing the previous gazetteer",
  lgas: "Loading LGA boundaries",
  wards: "Loading ward polygons",
  population: "Loading population estimates",
  facilities: "Loading health facilities",
  assign: "Assigning facilities to wards",
  aliases: "Harvesting name aliases",
  coverage: "Checking name coverage",
  complete: "Finishing",
};

interface GisGazetteerRebuildStatusProps {
  pending: GisPendingRebuild;
  onClear: () => void;
  className?: string;
}

/** Compact file-send progress — render on the slot row after the dialog closes. */
export function GisLayerUploadStatus({
  pending,
  className,
}: {
  pending: GisPendingUpload;
  className?: string;
}) {
  const sending = pending.percent < 100;
  const barWidth = sending
    ? Math.min(100, Math.max(pending.percent, 4))
    : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border border-info/30 bg-info/6 px-3 py-2 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-info" />
        <span className="min-w-0">
          {sending ? (
            <>
              Sending {pending.fileName}
              <span className="tabular-nums"> — {pending.percent}%</span>
            </>
          ) : (
            <>Saving {pending.fileName} and activating the slot</>
          )}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-info/20">
        {sending ? (
          <div
            className="h-full rounded-full bg-info transition-all duration-300"
            style={{ width: `${barWidth}%` }}
          />
        ) : (
          <div className="h-full w-2/3 animate-pulse rounded-full bg-info" />
        )}
      </div>
    </div>
  );
}

/** Compact rebuild progress — render next to the layer that was just uploaded. */
export function GisGazetteerRebuildStatus({
  pending,
  onClear,
  className,
}: GisGazetteerRebuildStatusProps) {
  const queryClient = useQueryClient();
  const jobQuery = useGisJobStatus(pending.jobId);
  const status = jobQuery.data?.status;
  const progress = jobQuery.data?.progress ?? 0;
  const stage = jobQuery.data?.stage;
  const queued = jobQuery.data?.queued ?? status === "waiting";
  const failed = status === "failed";
  const active =
    status != null &&
    !failed &&
    status !== "completed" &&
    status !== "not_found";
  const stageLabel = stage ? STAGE_LABELS[stage] ?? stage : null;
  const barWidth = queued
    ? undefined
    : active
      ? Math.min(100, Math.max(progress, 4))
      : 0;

  useEffect(() => {
    if (!status) return;
    if (status === "completed") {
      toast.success(`${GIS_SLOT_LABELS[pending.slot]} — gazetteer rebuild finished`);
      queryClient.invalidateQueries({ queryKey: ["gis-reference-layers"] });
      queryClient.invalidateQueries({ queryKey: ["gis-resolution-report"] });
      onClear();
    } else if (status === "failed") {
      toast.error(
        jobQuery.data?.failedReason ??
          `${GIS_SLOT_LABELS[pending.slot]} — gazetteer rebuild failed`,
      );
      onClear();
    } else if (status === "not_found") {
      toast.error("Gazetteer rebuild job not found");
      onClear();
    }
  }, [
    status,
    jobQuery.data?.failedReason,
    onClear,
    pending.slot,
    queryClient,
  ]);

  if (status === "completed") return null;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        failed
          ? "border-destructive/30 bg-destructive/6"
          : "border-info/30 bg-info/6",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-info" />
        )}
        <span className="min-w-0">
          {failed ? (
            <>
              Gazetteer rebuild failed
              {jobQuery.data?.failedReason ? (
                <span className="text-muted-foreground">
                  {" "}
                  — {jobQuery.data.failedReason}
                </span>
              ) : null}
            </>
          ) : queued ? (
            <>
              Queued for gazetteer rebuild
              {stageLabel ? (
                <span className="text-muted-foreground"> · {stageLabel}</span>
              ) : null}
            </>
          ) : (
            <>
              Rebuilding gazetteer
              {active ? (
                <span className="tabular-nums"> — {Math.round(progress)}%</span>
              ) : null}
              {stageLabel ? (
                <span className="text-muted-foreground"> · {stageLabel}</span>
              ) : null}
            </>
          )}
        </span>
      </div>
      {!failed && active ? (
        queued ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-info/20">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-info" />
          </div>
        ) : (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-info/20">
            <div
              className="h-full rounded-full bg-info transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        )
      ) : null}
      {queued ? (
        <p className="mt-1 text-xs text-muted-foreground">
          If this stays queued for several minutes, check System Health or contact the platform
          team.
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer GisGazetteerRebuildStatus inline on the layer row. */
export function GisGazetteerRebuildBanner(props: {
  pending: GisPendingRebuild | null;
  onClear: () => void;
}) {
  if (!props.pending) return null;
  return <GisGazetteerRebuildStatus pending={props.pending} onClear={props.onClear} />;
}
