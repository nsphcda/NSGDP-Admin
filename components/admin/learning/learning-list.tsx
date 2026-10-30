"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteLearning,
  listLearning,
  reorderLearning,
  setLearningStatus,
  type LearningItem,
  type LearningKind,
} from "@/lib/api/learning";
import { formatDate } from "@/lib/utils/date";
import { describeError } from "./guide-editor";
import { KIND_LABELS, LearningItemDialog } from "./learning-item-dialog";

/** One-line detail shown under each title, per content type. */
function detail(item: LearningItem): string {
  const d = item.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (item.kind) {
    case "guide":
      return `${d.category} · ${d.level} · ${(d.steps ?? []).length} steps`;
    case "path":
      return `${d.audience} · ${(d.guides ?? []).length} guides`;
    case "video":
      return `${d.duration} · ${d.assetId || d.externalUrl ? "recording attached" : "no recording yet"}`;
    case "faq":
      return d.group;
    case "glossary":
      return d.category;
    case "template":
      return `${d.format} · ${d.assetId ? "uploaded file" : "built-in file"}`;
    case "update":
      return `${d.date} · ${d.tag}`;
  }
}

export function LearningList({ kind }: { kind: LearningKind }) {
  const queryClient = useQueryClient();
  const label = KIND_LABELS[kind];
  const key = ["admin", "learning", kind] as const;

  const { data: items, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => listLearning(kind),
  });

  const [editing, setEditing] = useState<LearningItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<LearningItem | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "learning"] });

  const status = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "draft" | "published" }) =>
      setLearningStatus(kind, id, next),
    onSuccess: (item) => {
      void refresh();
      toast.success(item.status === "published" ? "Published" : "Moved to draft");
    },
    onError: (e) => toast.error(describeError(e, "Could not change status")),
  });

  const move = useMutation({
    mutationFn: ({ index, delta }: { index: number; delta: -1 | 1 }) => {
      const ids = (items ?? []).map((i) => i.id);
      const j = index + delta;
      [ids[index], ids[j]] = [ids[j], ids[index]];
      return reorderLearning(kind, ids);
    },
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(describeError(e, "Could not reorder")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLearning(kind, id),
    onSuccess: () => {
      setToDelete(null);
      void refresh();
      toast.success("Deleted");
    },
    onError: (e) => {
      setToDelete(null);
      toast.error(describeError(e, "Could not delete"));
    },
  });

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "Loading…"}. Drafts are
          hidden from the portal. Order here is the order readers see.
        </p>
        {kind === "guide" ? (
          <Link
            href="/learning/guides/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" aria-hidden />
            New guide
          </Link>
        ) : (
          <Button type="button" className="h-9 gap-1.5" onClick={openNew}>
            <Plus className="size-4" aria-hidden />
            New {label.singular}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load {label.plural.toLowerCase()}.</p>
      ) : !items?.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px] uppercase tracking-wide">
                <TableHead className="px-4">{label.titleLabel}</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Updated</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-md px-4 py-3">
                    {kind === "guide" ? (
                      <Link
                        href={`/learning/guides/${item.id}`}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">{detail(item)}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant={item.status === "published" ? "default" : "secondary"}>
                      {item.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(item.updated_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={index === 0 || move.isPending}
                        onClick={() => move.mutate({ index, delta: -1 })}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={index === items.length - 1 || move.isPending}
                        onClick={() => move.mutate({ index, delta: 1 })}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={item.status === "published" ? "Unpublish" : "Publish"}
                        title={item.status === "published" ? "Unpublish" : "Publish"}
                        disabled={status.isPending}
                        onClick={() =>
                          status.mutate({
                            id: item.id,
                            next: item.status === "published" ? "draft" : "published",
                          })
                        }
                      >
                        {item.status === "published" ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </Button>
                      {kind === "guide" ? (
                        <Link
                          href={`/learning/guides/${item.id}`}
                          aria-label="Edit"
                          className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => {
                            setEditing(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => setToDelete(item)}
                      >
                        <Trash2 className="size-4 text-destructive" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {kind !== "guide" ? (
        <LearningItemDialog
          kind={kind}
          item={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete this ${label.singular}?`}
        description={`“${toDelete?.title ?? ""}” is removed from the portal immediately. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={remove.isPending}
        closeOnConfirm={false}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
