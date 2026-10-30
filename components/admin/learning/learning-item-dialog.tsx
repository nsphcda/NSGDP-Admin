"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  assetUrl,
  createLearning,
  GUIDE_CATEGORIES,
  LEARNING_AUDIENCES,
  LEARNING_ICONS,
  listLearning,
  updateLearning,
  type GuideCategory,
  type GuideData,
  type LearningItem,
  type LearningKind,
} from "@/lib/api/learning";
import { AudiencePicker, Field, NativeSelect } from "./fields";
import { describeError } from "./guide-editor";
import {
  MediaPicker,
  UploadTemplateButton,
  UploadVideoButton,
  useLearningAssets,
} from "./media-library";

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- per-kind shapes are validated server-side

export const KIND_LABELS: Record<LearningKind, { singular: string; plural: string; titleLabel: string }> = {
  guide: { singular: "guide", plural: "Guides", titleLabel: "Title" },
  path: { singular: "learning path", plural: "Learning paths", titleLabel: "Title" },
  video: { singular: "video", plural: "Videos", titleLabel: "Title" },
  faq: { singular: "FAQ", plural: "FAQs", titleLabel: "Question" },
  glossary: { singular: "glossary term", plural: "Glossary", titleLabel: "Term" },
  template: { singular: "template", plural: "Templates", titleLabel: "Name" },
  update: { singular: "platform update", plural: "Updates", titleLabel: "Title" },
};

const FAQ_GROUPS = [
  "Getting started",
  "Uploading",
  "Review & publishing",
  "Access & privacy",
  "Analytics & maps",
] as const;
const GLOSSARY_CATEGORIES = ["Workflow", "Access", "Data", "Geography", "Analytics"] as const;

const today = () => new Date().toISOString().slice(0, 10);

function defaults(kind: LearningKind): Data {
  switch (kind) {
    case "path":
      return { description: "", audience: "contributor", icon: "book", guides: [] };
    case "video":
      return {
        description: "",
        duration: "0:00",
        category: "getting-started",
        chapters: [],
        featured: false,
      };
    case "faq":
      return { answer: "", group: "Getting started" };
    case "glossary":
      return { definition: "", category: "Data" };
    case "template":
      return { description: "", format: "CSV", filename: "", audience: ["contributor"] };
    case "update":
      return { date: today(), description: "", tag: "New" };
    default:
      return {};
  }
}

export function LearningItemDialog({
  kind,
  item,
  open,
  onOpenChange,
}: {
  kind: LearningKind;
  item: LearningItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The form lives inside the dialog content, which only mounts while open,
  // so its state starts fresh from `item` every time.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ItemForm key={item?.id ?? "new"} kind={kind} item={item} onOpenChange={onOpenChange} />
      ) : null}
    </Dialog>
  );
}

function ItemForm({
  kind,
  item,
  onOpenChange,
}: {
  kind: LearningKind;
  item: LearningItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? "");
  const [data, setData] = useState<Data>(
    item ? { ...defaults(kind), ...(item.data as Data) } : defaults(kind),
  );
  const [posterPicker, setPosterPicker] = useState(false);

  const { data: guides } = useQuery({
    queryKey: ["admin", "learning", "guide"],
    queryFn: () => listLearning<GuideData>("guide"),
    enabled: kind === "path" || kind === "video" || kind === "update",
  });
  const { data: videos } = useLearningAssets("video");
  const { data: images } = useLearningAssets("image");

  const set = (p: Data) => setData((d) => ({ ...d, ...p }));
  const label = KIND_LABELS[kind];

  const save = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim(), data: strip(kind, data) };
      return item
        ? updateLearning(kind, item.id, payload)
        : createLearning(kind, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "learning"] });
      toast.success(item ? "Saved" : `${cap(label.singular)} created as a draft`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(describeError(e, "Could not save")),
  });

  const guideOptions = guides ?? [];
  const videoAsset = videos?.find((v) => v.id === data.assetId);
  const posterAsset = images?.find((v) => v.id === data.posterAssetId);

  return (
    <>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit" : "New"} {label.singular}
          </DialogTitle>
          <DialogDescription>
            {item ? "Changes appear on the portal once the item is published." : "Created as a draft; publish it when it is ready."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={label.titleLabel} htmlFor="li-title">
            <Input id="li-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          {kind === "faq" ? (
            <>
              <Field label="Answer" htmlFor="li-answer">
                <Textarea
                  id="li-answer"
                  rows={5}
                  value={data.answer}
                  onChange={(e) => set({ answer: e.target.value })}
                />
              </Field>
              <Field label="Group" htmlFor="li-group">
                <NativeSelect
                  id="li-group"
                  value={data.group as string}
                  onChange={(group) => set({ group })}
                  options={FAQ_GROUPS.map((g) => ({ value: g, label: g }))}
                />
              </Field>
            </>
          ) : null}

          {kind === "glossary" ? (
            <>
              <Field label="Definition" htmlFor="li-def">
                <Textarea
                  id="li-def"
                  rows={4}
                  value={data.definition}
                  onChange={(e) => set({ definition: e.target.value })}
                />
              </Field>
              <Field label="Category" htmlFor="li-gcat">
                <NativeSelect
                  id="li-gcat"
                  value={data.category as string}
                  onChange={(category) => set({ category })}
                  options={GLOSSARY_CATEGORIES.map((g) => ({ value: g, label: g }))}
                />
              </Field>
            </>
          ) : null}

          {kind === "update" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" htmlFor="li-date">
                  <Input
                    id="li-date"
                    type="date"
                    value={data.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </Field>
                <Field label="Tag" htmlFor="li-tag">
                  <NativeSelect
                    id="li-tag"
                    value={data.tag as string}
                    onChange={(tag) => set({ tag })}
                    options={["New", "Improved", "Heads up"].map((g) => ({ value: g, label: g }))}
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor="li-udesc">
                <Textarea
                  id="li-udesc"
                  rows={3}
                  value={data.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <Field label="Related guide (optional)" htmlFor="li-uguide">
                <NativeSelect
                  id="li-uguide"
                  value={(data.guide as string) ?? ""}
                  onChange={(guide) => set({ guide: guide || undefined })}
                  options={[
                    { value: "", label: "None" },
                    ...guideOptions.map((g) => ({ value: g.slug, label: g.title })),
                  ]}
                />
              </Field>
            </>
          ) : null}

          {kind === "template" ? (
            <>
              <Field label="Description" htmlFor="li-tdesc">
                <Textarea
                  id="li-tdesc"
                  rows={3}
                  value={data.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Format" htmlFor="li-tfmt">
                  <NativeSelect
                    id="li-tfmt"
                    value={data.format as string}
                    onChange={(format) => set({ format })}
                    options={[
                      { value: "CSV", label: "CSV" },
                      { value: "TXT", label: "TXT" },
                    ]}
                  />
                </Field>
                <Field label="Download file name" htmlFor="li-tfile">
                  <Input
                    id="li-tfile"
                    value={data.filename}
                    placeholder="lga-indicator-template.csv"
                    onChange={(e) => set({ filename: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Audience">
                <AudiencePicker value={data.audience} onChange={(audience) => set({ audience })} />
              </Field>
              <Field
                label="File"
                hint={
                  data.assetId
                    ? "An uploaded file is attached and will be downloaded."
                    : data.generatorKey
                      ? "No file uploaded: the portal's built-in generated template is used."
                      : "Upload the file readers will download."
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <UploadTemplateButton onUploaded={(a) => set({ assetId: a.id })} />
                  {data.assetId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set({ assetId: undefined })}
                    >
                      Use built-in file instead
                    </Button>
                  ) : null}
                </div>
              </Field>
            </>
          ) : null}

          {kind === "path" ? (
            <>
              <Field label="Description" htmlFor="li-pdesc">
                <Textarea
                  id="li-pdesc"
                  rows={3}
                  value={data.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Audience" htmlFor="li-paud">
                  <NativeSelect
                    id="li-paud"
                    value={data.audience as string}
                    onChange={(audience) => set({ audience })}
                    options={LEARNING_AUDIENCES.map((a) => ({ value: a.id, label: a.label }))}
                  />
                </Field>
                <Field label="Icon" htmlFor="li-picon">
                  <NativeSelect
                    id="li-picon"
                    value={data.icon as string}
                    onChange={(icon) => set({ icon })}
                    options={LEARNING_ICONS.map((v) => ({ value: v, label: v }))}
                  />
                </Field>
              </div>
              <Field label="Guides, in order">
                <div className="space-y-2">
                  {(data.guides as string[]).map((slug, i, list) => {
                    const g = guideOptions.find((x) => x.slug === slug);
                    return (
                      <div key={slug} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                        <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {g?.title ?? slug}
                          {g && g.status !== "published" ? (
                            <span className="ml-2 text-xs text-muted-foreground">(draft: hidden from readers)</span>
                          ) : null}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => {
                            const next = [...list];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            set({ guides: next });
                          }}
                        >
                          <ArrowUp className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move down"
                          disabled={i === list.length - 1}
                          onClick={() => {
                            const next = [...list];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            set({ guides: next });
                          }}
                        >
                          <ArrowDown className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove"
                          onClick={() => set({ guides: list.filter((s) => s !== slug) })}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                    );
                  })}
                  <NativeSelect
                    aria-label="Add a guide"
                    value=""
                    onChange={(slug) => slug && set({ guides: [...data.guides, slug] })}
                    options={[
                      { value: "", label: "Add a guide…" },
                      ...guideOptions
                        .filter((g) => !(data.guides as string[]).includes(g.slug))
                        .map((g) => ({ value: g.slug, label: g.title })),
                    ]}
                  />
                </div>
              </Field>
            </>
          ) : null}

          {kind === "video" ? (
            <>
              <Field label="Description" htmlFor="li-vdesc">
                <Textarea
                  id="li-vdesc"
                  rows={3}
                  value={data.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Duration (m:ss)" htmlFor="li-vdur">
                  <Input
                    id="li-vdur"
                    value={data.duration}
                    onChange={(e) => set({ duration: e.target.value })}
                  />
                </Field>
                <Field label="Category" htmlFor="li-vcat">
                  <NativeSelect<GuideCategory>
                    id="li-vcat"
                    value={data.category}
                    onChange={(category) => set({ category })}
                    options={GUIDE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
                  />
                </Field>
                <Field label="Related guide" htmlFor="li-vguide">
                  <NativeSelect
                    id="li-vguide"
                    value={(data.guide as string) ?? ""}
                    onChange={(guide) => set({ guide: guide || undefined })}
                    options={[
                      { value: "", label: "None" },
                      ...guideOptions.map((g) => ({ value: g.slug, label: g.title })),
                    ]}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={Boolean(data.featured)}
                  onChange={(e) => set({ featured: e.target.checked })}
                />
                Feature this video
              </label>

              <Field
                label="Recording"
                hint="Uploaded straight to storage. Without a recording the portal shows “coming soon”."
              >
                <div className="space-y-2">
                  {data.assetId ? (
                    <div className="space-y-2">
                      {videoAsset ? (
                        <video
                          src={assetUrl(videoAsset.url)}
                          controls
                          preload="metadata"
                          className="max-h-56 w-full rounded-lg border bg-black"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">Recording attached.</p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => set({ assetId: undefined })}
                      >
                        Detach recording
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <UploadVideoButton onUploaded={(a) => set({ assetId: a.id })} />
                    {videos?.length ? (
                      <NativeSelect
                        aria-label="Use an existing recording"
                        value=""
                        onChange={(id) => id && set({ assetId: id })}
                        options={[
                          { value: "", label: "Or pick an uploaded video…" },
                          ...videos.map((v) => ({ value: v.id, label: v.file_name })),
                        ]}
                      />
                    ) : null}
                  </div>
                </div>
              </Field>

              <Field label="Poster image (optional)">
                <div className="flex flex-wrap items-center gap-3">
                  {posterAsset ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed-redirect media from the API
                    <img
                      src={assetUrl(posterAsset.url)}
                      alt={posterAsset.alt ?? "Poster"}
                      className="h-16 rounded border"
                    />
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={() => setPosterPicker(true)}>
                    {data.posterAssetId ? "Change poster" : "Choose poster"}
                  </Button>
                  {data.posterAssetId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set({ posterAssetId: undefined })}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </Field>

              <Field label="External link (optional)" htmlFor="li-vext" hint="Used when there is no uploaded recording, e.g. a YouTube link.">
                <Input
                  id="li-vext"
                  placeholder="https://…"
                  value={data.externalUrl ?? ""}
                  onChange={(e) => set({ externalUrl: e.target.value || undefined })}
                />
              </Field>

              <Field label="Chapters">
                <div className="space-y-2">
                  {(data.chapters as Array<{ time: string; label: string }>).map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        aria-label={`Chapter ${i + 1} time`}
                        className="w-24"
                        placeholder="0:00"
                        value={c.time}
                        onChange={(e) =>
                          set({
                            chapters: data.chapters.map((x: { time: string; label: string }, j: number) =>
                              j === i ? { ...x, time: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`Chapter ${i + 1} label`}
                        placeholder="What happens here"
                        value={c.label}
                        onChange={(e) =>
                          set({
                            chapters: data.chapters.map((x: { time: string; label: string }, j: number) =>
                              j === i ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove chapter"
                        onClick={() =>
                          set({ chapters: data.chapters.filter((_: unknown, j: number) => j !== i) })
                        }
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => set({ chapters: [...data.chapters, { time: "", label: "" }] })}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add chapter
                  </Button>
                </div>
              </Field>

              <MediaPicker
                open={posterPicker}
                onOpenChange={setPosterPicker}
                onSelect={(a) => set({ posterAssetId: a.id })}
              />
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Drop blank optional fields so the server schema sees them as absent. */
function strip(kind: LearningKind, data: Data): Data {
  const out: Data = { ...data };
  for (const k of ["guide", "assetId", "posterAssetId", "externalUrl", "generatorKey"]) {
    if (out[k] === "" || out[k] == null) delete out[k];
  }
  if (kind === "video") {
    out.chapters = (out.chapters as Array<{ time: string; label: string }>).filter(
      (c) => c.time.trim() && c.label.trim(),
    );
  }
  return out;
}
