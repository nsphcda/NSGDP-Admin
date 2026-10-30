"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, Loader2, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assetUrl,
  deleteLearningAsset,
  listLearningAssets,
  uploadLearningFile,
  uploadLearningImage,
  uploadLearningVideo,
  type LearningAsset,
} from "@/lib/api/learning";

export const LEARNING_ASSETS_KEY = ["admin", "learning", "assets"] as const;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/** Upload button + progress for one kind of media. */
function UploadButton({
  accept,
  label,
  icon: Icon,
  upload,
  onUploaded,
}: {
  accept: string;
  label: string;
  icon: typeof Upload;
  upload: (file: File, onProgress: (p: number) => void) => Promise<LearningAsset>;
  onUploaded?: (asset: LearningAsset) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const run = async (file: File) => {
    setProgress(0);
    try {
      const asset = await upload(file, setProgress);
      await queryClient.invalidateQueries({ queryKey: LEARNING_ASSETS_KEY });
      toast.success(`${file.name} uploaded`);
      onUploaded?.(asset);
    } catch (e) {
      toast.error(errorMessage(e, "Upload failed"));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        {progress !== null ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-3.5" aria-hidden />
        )}
        {progress !== null ? `${label} ${progress}%` : label}
      </Button>
    </>
  );
}

export function UploadImageButton({
  onUploaded,
}: {
  onUploaded?: (asset: LearningAsset) => void;
}) {
  return (
    <UploadButton
      accept="image/png,image/jpeg,image/webp"
      label="Upload image"
      icon={ImageIcon}
      upload={(file, onProgress) => uploadLearningImage(file, undefined, onProgress)}
      onUploaded={onUploaded}
    />
  );
}

export function UploadVideoButton({
  onUploaded,
}: {
  onUploaded?: (asset: LearningAsset) => void;
}) {
  return (
    <UploadButton
      accept="video/mp4,video/webm"
      label="Upload video"
      icon={Video}
      upload={(file, onProgress) => uploadLearningVideo(file, onProgress)}
      onUploaded={onUploaded}
    />
  );
}

export function UploadTemplateButton({
  onUploaded,
}: {
  onUploaded?: (asset: LearningAsset) => void;
}) {
  return (
    <UploadButton
      accept=".csv,.txt,text/csv,text/plain"
      label="Upload template file"
      icon={FileText}
      upload={(file, onProgress) => uploadLearningFile(file, onProgress)}
      onUploaded={onUploaded}
    />
  );
}

export function useLearningAssets(kind?: LearningAsset["kind"]) {
  return useQuery({
    queryKey: [...LEARNING_ASSETS_KEY, kind ?? "all"],
    queryFn: () => listLearningAssets(kind),
  });
}

/** Full media library: upload, preview, see where each file is used, delete. */
export function MediaLibrary() {
  const queryClient = useQueryClient();
  const { data: assets, isLoading, isError } = useLearningAssets();
  const [toDelete, setToDelete] = useState<LearningAsset | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deleteLearningAsset(id),
    onSuccess: () => {
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: LEARNING_ASSETS_KEY });
      toast.success("Media deleted");
    },
    onError: (e) => {
      setToDelete(null);
      toast.error(errorMessage(e, "Could not delete media"));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <UploadImageButton />
        <UploadVideoButton />
        <UploadTemplateButton />
        <p className="text-xs text-muted-foreground">
          Images up to 5 MB (PNG, JPEG, WebP). Videos MP4 or WebM, uploaded straight to storage.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load the media library.</p>
      ) : !assets?.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No media yet. Upload screenshots and videos to use them in guides.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {assets.map((a) => (
            <figure key={a.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <div className="flex aspect-video items-center justify-center bg-muted/40">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed-redirect media from the API
                  <img
                    src={assetUrl(a.url)}
                    alt={a.alt ?? a.file_name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : a.kind === "video" ? (
                  <video
                    src={assetUrl(a.url)}
                    preload="metadata"
                    controls
                    className="size-full bg-black object-contain"
                  />
                ) : (
                  <FileText className="size-8 text-muted-foreground/50" aria-hidden />
                )}
              </div>
              <figcaption className="flex flex-1 flex-col gap-1 p-3 text-xs">
                <span className="truncate font-medium" title={a.file_name}>
                  {a.file_name}
                </span>
                <span className="text-muted-foreground">
                  {a.kind} · {formatSize(a.size)}
                </span>
                <span className="text-muted-foreground">
                  {a.used_by?.length
                    ? `Used by ${a.used_by.map((u) => u.title).join(", ")}`
                    : "Not used yet"}
                </span>
                <div className="mt-auto pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-destructive"
                    disabled={Boolean(a.used_by?.length)}
                    title={a.used_by?.length ? "Remove it from its content first" : "Delete"}
                    onClick={() => setToDelete(a)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </Button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this file?"
        description={`${toDelete?.file_name ?? "This file"} will be removed from storage. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={remove.isPending}
        closeOnConfirm={false}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}

/** Pick an uploaded image (or upload one) for a guide step. */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: LearningAsset) => void;
}) {
  const { data: images, isLoading } = useLearningAssets("image");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose a screenshot</DialogTitle>
          <DialogDescription>Pick an existing image or upload a new one.</DialogDescription>
        </DialogHeader>
        <div>
          <UploadImageButton
            onUploaded={(asset) => {
              onSelect(asset);
              onOpenChange(false);
            }}
          />
        </div>
        <div className="grid max-h-[50vh] gap-3 overflow-y-auto sm:grid-cols-3">
          {isLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !images?.length ? (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              No images yet.
            </p>
          ) : (
            images.map((a) => (
              <button
                key={a.id}
                type="button"
                className="overflow-hidden rounded-lg border text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => {
                  onSelect(a);
                  onOpenChange(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed-redirect media from the API */}
                <img
                  src={assetUrl(a.url)}
                  alt={a.alt ?? a.file_name}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span className="block truncate px-2 py-1.5 text-xs">{a.file_name}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
