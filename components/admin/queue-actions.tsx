"use client";

import { useState } from "react";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQueueControls } from "@/lib/hooks/useIngestionOps";

function messageOf(error: unknown, fallback: string): string {
  return (error as { message?: string })?.message || fallback;
}

/**
 * Operator controls for one queue. Pause/resume are immediate; cleaning asks
 * for a click-through; draining deletes every job, including running ones, and
 * only unlocks after the exact phrase is typed.
 */
export function QueueActions({
  queue,
  paused,
}: {
  queue: string;
  paused: boolean;
}) {
  const { pause, resume, clean, drain } = useQueueControls();
  const [cleanOpen, setCleanOpen] = useState(false);
  const [drainOpen, setDrainOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const phrase = `DRAIN ${queue}`;
  const busy =
    pause.isPending || resume.isPending || clean.isPending || drain.isPending;

  const togglePause = () => {
    const mutation = paused ? resume : pause;
    mutation.mutate(queue, {
      onSuccess: () =>
        toast.success(`${queue} ${paused ? "resumed" : "paused"}`),
      onError: (e) => toast.error(messageOf(e, "Action failed")),
    });
  };

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={busy}
        onClick={togglePause}
        aria-label={`${paused ? "Resume" : "Pause"} ${queue}`}
      >
        {pause.isPending || resume.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : paused ? (
          <Play className="size-4" />
        ) : (
          <Pause className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={busy}
        onClick={() => setCleanOpen(true)}
      >
        Clean
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive"
        disabled={busy}
        onClick={() => {
          setTyped("");
          setDrainOpen(true);
        }}
        aria-label={`Drain ${queue}`}
      >
        <Trash2 className="size-4" />
      </Button>

      <ConfirmDialog
        open={cleanOpen}
        onOpenChange={setCleanOpen}
        title={`Clean ${queue}?`}
        description="Removes completed and failed jobs older than one hour. Waiting, delayed and running jobs are never touched."
        confirmLabel="Clean"
        loading={clean.isPending}
        onConfirm={() =>
          clean.mutate(queue, {
            onSuccess: (result) => {
              toast.success(
                `Removed ${result.removed.completed} completed and ${result.removed.failed} failed job(s)`,
              );
              setCleanOpen(false);
            },
            onError: (e) => toast.error(messageOf(e, "Clean failed")),
          })
        }
      />

      <Dialog open={drainOpen} onOpenChange={setDrainOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Drain {queue}
            </DialogTitle>
            <DialogDescription>
              This deletes <strong>every</strong> job on this queue, including
              waiting and running ones. It cannot be undone. Anything queued
              here is lost and affected uploads must be retried.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Type <code className="font-mono font-semibold">{phrase}</code> to
              confirm.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={phrase}
              aria-label="Confirmation phrase"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrainOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== phrase || drain.isPending}
              onClick={() =>
                drain.mutate(
                  { queue, confirm: typed },
                  {
                    onSuccess: () => {
                      toast.success(`${queue} drained`);
                      setDrainOpen(false);
                    },
                    onError: (e) => toast.error(messageOf(e, "Drain failed")),
                  },
                )
              }
            >
              {drain.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Drain queue"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
