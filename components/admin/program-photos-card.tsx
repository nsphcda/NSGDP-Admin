"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Images, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProgramImageActions, useProgramImages } from "@/lib/hooks/usePrograms";
import type { ProgrammeImage } from "@/lib/api/programs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}

/**
 * Photo gallery of one programme: upload, caption, choose the cover, reorder
 * and delete. Photos show on the public Programs page.
 */
export function ProgramPhotosCard({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const { data: images = [], isLoading } = useProgramImages(slug);
  const actions = useProgramImageActions(slug);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ProgrammeImage | null>(null);
  const busy = actions.reorder.isPending || actions.update.isPending || actions.remove.isPending;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(list.length);
    let ok = 0;
    // One at a time keeps the server's photo limit and ordering simple.
    for (const file of list) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 10 MB.`);
      } else {
        try {
          await actions.upload.mutateAsync(file);
          ok += 1;
        } catch (err) {
          toast.error(`${file.name}: ${errorMessage(err)}`);
        }
      }
      setUploading((n) => n - 1);
    }
    if (ok > 0) toast.success(ok === 1 ? "Photo added." : `${ok} photos added.`);
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, delta: number) {
    const ids = images.map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    actions.reorder.mutate(ids, { onError: (e) => toast.error(errorMessage(e)) });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b">
        <CardTitle className="flex items-center gap-2">
          <Images className="size-4 text-muted-foreground" />
          Photos
          {images.length > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">({images.length})</span>
          ) : null}
        </CardTitle>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              aria-label="Choose photos to upload"
              onChange={(e) => void onFiles(e.target.files)}
            />
            <Button
              type="button"
              size="lg"
              disabled={uploading > 0}
              onClick={() => inputRef.current?.click()}
            >
              {uploading > 0 ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploading > 0 ? `Uploading ${uploading}…` : "Add photos"}
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {canEdit ? (
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP, up to 10 MB each, 40 photos per programme. Location data is
            removed automatically. The cover photo leads the public Programs page.
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No photos yet. The public page shows a generated cover until one is added.
            {canEdit ? " The first photo you add becomes the cover." : ""}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {images.map((image, index) => (
              <li key={image.id} className="flex gap-3 rounded-xl border bg-card p-2.5">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.thumbUrl}
                    alt={image.alt || image.caption || `Photo ${index + 1}`}
                    className="size-full object-cover"
                  />
                  {image.isCover ? (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      <Star className="size-3" /> Cover
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {canEdit ? (
                    <CaptionField
                      image={image}
                      onSave={(caption) =>
                        actions.update.mutate(
                          { imageId: image.id, data: { caption, alt: caption } },
                          { onError: (e) => toast.error(errorMessage(e)) },
                        )
                      }
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{image.caption || "No caption"}</p>
                  )}
                  {canEdit ? (
                    <div className="mt-auto flex flex-wrap items-center gap-1">
                      <IconBtn
                        label="Move earlier"
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </IconBtn>
                      <IconBtn
                        label="Move later"
                        disabled={busy || index === images.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </IconBtn>
                      <IconBtn
                        label="Use as cover"
                        disabled={busy || image.isCover}
                        onClick={() =>
                          actions.update.mutate(
                            { imageId: image.id, data: { isCover: true } },
                            {
                              onSuccess: () => toast.success("Cover updated."),
                              onError: (e) => toast.error(errorMessage(e)),
                            },
                          )
                        }
                      >
                        <Star className={cn("size-4", image.isCover && "fill-current")} />
                      </IconBtn>
                      <IconBtn
                        label="Delete photo"
                        disabled={busy}
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete(image)}
                      >
                        <Trash2 className="size-4" />
                      </IconBtn>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this photo?"
        description="The photo is removed from the programme and its storage. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!pendingDelete) return;
          actions.remove.mutate(pendingDelete.id, {
            onSuccess: () => toast.success("Photo deleted."),
            onError: (e) => toast.error(errorMessage(e)),
          });
        }}
      />
    </Card>
  );
}

function IconBtn({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

/** Saves on blur or Enter, only when the text changed. */
function CaptionField({
  image,
  onSave,
}: {
  image: ProgrammeImage;
  onSave: (caption: string) => void;
}) {
  const [value, setValue] = useState(image.caption ?? "");
  const commit = () => {
    const next = value.trim();
    if (next !== (image.caption ?? "")) onSave(next);
  };
  return (
    <Input
      value={value}
      maxLength={300}
      placeholder="Add a caption"
      aria-label="Photo caption"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
