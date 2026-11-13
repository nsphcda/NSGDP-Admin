"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, DatabaseBackup, Loader2, MinusCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageEyebrow } from "@/components/admin/admin-analytics-ui";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  getDataSeedPlan,
  getDataSeedStatus,
  startDataSeed,
  type DataSeedOptions,
  type SeedItemState,
  type SeedItemStatus,
  type SeedPlanItem,
} from "@/lib/api/data-seed";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function existingLabel(existing: string | null): { text: string; tone: "new" | "done" | "resume" } {
  if (!existing) return { text: "New", tone: "new" };
  if (existing === "published" || existing === "in library") {
    return { text: "Already on the server", tone: "done" };
  }
  return { text: `Will resume (${existing.replace("_", " ")})`, tone: "resume" };
}

const STATUS_STYLE: Record<
  SeedItemStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  waiting: { label: "Waiting", icon: CircleDashed, className: "text-muted-foreground" },
  running: { label: "Running", icon: Loader2, className: "text-primary" },
  published: { label: "Published", icon: CheckCircle2, className: "text-emerald-600" },
  skipped: { label: "Skipped", icon: MinusCircle, className: "text-muted-foreground" },
  failed: { label: "Failed", icon: XCircle, className: "text-destructive" },
};

function StatusPill({ status }: { status: SeedItemStatus }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", s.className)}>
      <Icon className={cn("size-4", status === "running" && "animate-spin")} aria-hidden />
      {s.label}
    </span>
  );
}

function ItemRow({ item }: { item: SeedItemState }) {
  return (
    <li className="space-y-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {item.kind === "dataset" ? "Dataset" : "Document"} · {item.visibility} · {item.files} file
            {item.files === 1 ? "" : "s"} · {formatBytes(item.bytes)}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>
      {item.steps.length > 0 ? (
        <ol className="list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
          {item.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
      {item.detail ? (
        <p
          className={cn(
            "text-xs",
            item.status === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {item.detail}
        </p>
      ) : null}
    </li>
  );
}

export default function DataSeedPage() {
  const { isSuperAdmin, isLoading } = useAdminAccess();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<DataSeedOptions>({
    includeCaseRecords: true,
    includeReferenceTools: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const plan = useQuery({
    queryKey: ["data-seed", "plan", options],
    queryFn: () => getDataSeedPlan(options),
    enabled: isSuperAdmin,
  });

  const status = useQuery({
    queryKey: ["data-seed", "status"],
    queryFn: getDataSeedStatus,
    enabled: isSuperAdmin,
    // Poll while a run is going; the server keeps the result after it ends.
    refetchInterval: (query) => (query.state.data?.state === "running" ? 2000 : false),
  });

  const run = status.data ?? null;
  const running = run?.state === "running";

  const start = useMutation({
    mutationFn: () => startDataSeed(options),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["data-seed", "status"] });
      void queryClient.invalidateQueries({ queryKey: ["data-seed", "plan"] });
      toast.success("Import started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start the import"),
  });

  // Refresh the plan once a run ends, so "On the server" shows the new state.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
    } else if (wasRunning.current) {
      wasRunning.current = false;
      void queryClient.invalidateQueries({ queryKey: ["data-seed", "plan"] });
    }
  }, [running, queryClient]);

  if (isLoading) return null;
  if (!isSuperAdmin) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Only a super admin can use the data import.
      </p>
    );
  }

  const items: SeedPlanItem[] = plan.data ?? [];
  const toDo = items.filter((i) => i.existing !== "published" && i.existing !== "in library");
  const blocked = items.some((i) => i.filesMissing.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow label="Temporary tool" icon={DatabaseBackup} />
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Data import</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Uploads the audited real data files through the normal pipeline, as you: each dataset is
          created, its files are uploaded and virus-scanned, then it is submitted, QA-checked,
          validated, approved and published. Safe to run again: finished items are skipped and
          half-finished ones resume.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>What will be uploaded</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={options.includeCaseRecords}
                disabled={running}
                onCheckedChange={(v) =>
                  setOptions((o) => ({ ...o, includeCaseRecords: v === true }))
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Restricted case-record datasets</span>
                <span className="block text-muted-foreground">
                  One per disease (cholera, measles, diphtheria, meningitis, yellow fever). They hold
                  individual cases with names, so they are restricted and need an access request to
                  download.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={options.includeReferenceTools}
                disabled={running}
                onCheckedChange={(v) =>
                  setOptions((o) => ({ ...o, includeReferenceTools: v === true }))
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">NHMIS tools and EPI workplan</span>
                <span className="block text-muted-foreground">
                  Blank registers and a draft workplan. They are Excel files, which the Documents
                  library does not accept, so they are added as datasets.
                </span>
              </span>
            </label>
          </div>

          {plan.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : plan.error ? (
            <p className="text-sm text-destructive">
              {plan.error instanceof Error ? plan.error.message : "Could not load the plan"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Access</th>
                    <th className="px-3 py-2">Files</th>
                    <th className="px-3 py-2">On the server</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((i) => {
                    const e = existingLabel(i.existing);
                    return (
                      <tr key={i.id}>
                        <td className="px-3 py-2 font-medium">{i.title}</td>
                        <td className="px-3 py-2 capitalize">{i.kind}</td>
                        <td className="px-3 py-2">
                          <Badge variant={i.visibility === "restricted" ? "destructive" : "secondary"}>
                            {i.visibility}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {i.files} · {formatBytes(i.bytes)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2",
                            e.tone === "done" && "text-muted-foreground",
                            e.tone === "resume" && "text-amber-600",
                          )}
                        >
                          {i.filesMissing.length
                            ? `Missing files: ${i.filesMissing.join(", ")}`
                            : e.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={running || start.isPending || plan.isLoading || toDo.length === 0 || blocked}
              onClick={() => setConfirmOpen(true)}
            >
              {running || start.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <DatabaseBackup className="size-4" />
              )}
              {running ? "Import running…" : `Run import (${toDo.length} to do)`}
            </Button>
            {toDo.length === 0 && !plan.isLoading ? (
              <span className="text-sm text-muted-foreground">
                Everything in this selection is already on the server.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {run ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>{running ? "Import in progress" : "Last import"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                Started {new Date(run.startedAt).toLocaleString()}
                {run.finishedAt ? ` · finished ${new Date(run.finishedAt).toLocaleTimeString()}` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Published", value: run.summary.published, tone: "text-emerald-600" },
                { label: "Skipped", value: run.summary.skipped, tone: "" },
                {
                  label: "Failed",
                  value: run.summary.failed,
                  tone: run.summary.failed ? "text-destructive" : "",
                },
                { label: "Total", value: run.summary.total, tone: "" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <p className={cn("text-2xl font-bold tabular-nums", s.tone)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            {!running && run.summary.failed > 0 ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                Some items failed (see below). Fix the cause, then run the import again: it resumes
                from where each item stopped.
              </p>
            ) : null}
            {!running && run.summary.failed === 0 ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                Finished with no failures.
              </p>
            ) : null}
            <ul className="space-y-2">
              {run.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Run the data import?"
        description={`This creates and publishes ${toDo.length} item${toDo.length === 1 ? "" : "s"} on this server as you. Published datasets and documents become visible to users (restricted ones need an access request). It can take a few minutes; you can leave this page open to watch it.`}
        confirmLabel="Run import"
        onConfirm={() => start.mutate()}
      />
    </div>
  );
}
