"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageEyebrow } from "@/components/admin/admin-analytics-ui";
import { LearningList } from "@/components/admin/learning/learning-list";
import { KIND_LABELS } from "@/components/admin/learning/learning-item-dialog";
import { MediaLibrary } from "@/components/admin/learning/media-library";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { LEARNING_KINDS, seedLearningDefaults, type LearningKind } from "@/lib/api/learning";
import { cn } from "@/lib/utils";

type Tab = LearningKind | "media";

const TABS: Array<{ id: Tab; label: string }> = [
  ...LEARNING_KINDS.map((k) => ({ id: k as Tab, label: KIND_LABELS[k].plural })),
  { id: "media", label: "Media library" },
];

export default function LearningAdminPage() {
  const { can, isLoading } = useAdminAccess();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("guide");

  const seed = useMutation({
    mutationFn: seedLearningDefaults,
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "learning"] });
      toast.success(
        r.inserted > 0
          ? `Imported ${r.inserted} built-in items (${r.skipped} already existed)`
          : "Nothing to import: all built-in items already exist",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  if (isLoading) return null;
  if (!can("manage:learning")) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to edit the Learning Hub.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageEyebrow label="Content" icon={GraduationCap} />
          <h1 className="text-2xl font-bold tracking-tight">Learning Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit the guides, videos, FAQs and templates shown on the portal. Only published items are
            visible to readers.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={seed.isPending}
          title="Adds any built-in item that is missing. Never overwrites your edits."
          onClick={() => seed.mutate()}
        >
          <DatabaseBackup className="size-4" aria-hidden />
          Import built-in content
        </Button>
      </div>

      <div role="tablist" aria-label="Learning Hub content" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "media" ? <MediaLibrary /> : <LearningList key={tab} kind={tab} />}
      </div>
    </div>
  );
}
