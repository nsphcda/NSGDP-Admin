"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchWardsInLga } from "@/lib/hooks/useGisReference";
import { useConfirmOrgunitAlias } from "@/lib/hooks/useIngestionReview";
import type { ReviewQueueItem } from "@/lib/api/ingestion-review";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OrgunitConfirmDialogProps {
  item: ReviewQueueItem | null;
  onOpenChange: (open: boolean) => void;
}

export function OrgunitConfirmDialog({ item, onOpenChange }: OrgunitConfirmDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The sample's org-unit text is the row label itself (the ward being confirmed), so it
  // cannot name the LGA. The workbook sheet is the LGA in the sheet-per-LGA templates.
  const lgaHint = item?.cellRef?.split("!")[0]?.replace(/^'|'$/g, "").trim() ?? "";
  const { data: wards, isLoading } = useSearchWardsInLga(
    lgaHint,
    search || item?.rawText || "",
    !!item,
  );
  const confirmMutation = useConfirmOrgunitAlias(item?.datasetId);

  const candidates = useMemo(() => wards ?? [], [wards]);

  const handleConfirm = async () => {
    if (!item || !selectedId) return;
    try {
      const result = await confirmMutation.mutateAsync({
        aliasId: item.id,
        orgunitId: selectedId,
      });
      toast.success(`Confirmed — ${result.promoted} staged row(s) resolved`);
      onOpenChange(false);
    } catch {
      toast.error("Could not confirm org-unit alias");
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm org-unit alias</DialogTitle>
          <DialogDescription>
            Map &quot;{item?.rawText}&quot; to a canonical ward. This uses the same ladder as GIS
            coverage and writes to <code className="text-xs">orgunit_aliases</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="orgunit-ward-search">Search wards</Label>
            <Input
              id="orgunit-ward-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={item?.rawText ?? "Ward name"}
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : candidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No wards found.
              </p>
            ) : (
              <ul className="divide-y">
                {candidates.map((w) => (
                  <li key={w.wardId}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60",
                        selectedId === w.wardId && "bg-primary/10",
                      )}
                      onClick={() => setSelectedId(w.wardId)}
                    >
                      <span>
                        <span className="font-medium">{w.wardName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{w.lgaName}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(w.score * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || confirmMutation.isPending}
          >
            {confirmMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
