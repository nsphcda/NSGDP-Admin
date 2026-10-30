"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  assetUrl,
  createLearning,
  deleteLearning,
  GUIDE_CATEGORIES,
  getLearning,
  LEARNING_ICONS,
  listLearning,
  setLearningStatus,
  updateLearning,
  type GuideCategory,
  type GuideData,
  type GuideStepData,
  type LearningAsset,
  type LearningItem,
} from "@/lib/api/learning";
import { ApiError } from "@/lib/api/client";
import { AudiencePicker, clean, Field, NativeSelect, StringListEditor } from "./fields";
import { MediaPicker } from "./media-library";

type StepForm = GuideStepData & { key: string };

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: GuideData = {
  summary: "",
  category: "contribute",
  audience: ["contributor"],
  minutes: 5,
  level: "Beginner",
  icon: "book",
  featured: false,
  updated: today(),
  outcomes: [],
  steps: [],
  callouts: [],
  related: [],
};

/** Readable text for a validation failure from the API. */
export function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const errors = (e.details as { errors?: Array<{ path: string; message: string }> } | undefined)
      ?.errors;
    if (errors?.length) {
      return errors
        .slice(0, 4)
        .map((x) => (x.path ? `${x.path}: ${x.message}` : x.message))
        .join(" · ");
    }
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export function GuideEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin", "learning", "guide", id],
    queryFn: () => getLearning<GuideData>("guide", id),
    enabled: !isNew,
  });

  if (!isNew && (isLoading || !existing)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  // Keyed so the form re-initialises from the server copy after a save.
  return <GuideForm key={existing?.id ?? "new"} id={id} existing={existing} />;
}

function GuideForm({ id, existing }: { id: string; existing?: LearningItem<GuideData> }) {
  const isNew = id === "new";
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: allGuides } = useQuery({
    queryKey: ["admin", "learning", "guide"],
    queryFn: () => listLearning<GuideData>("guide"),
  });

  const [title, setTitle] = useState(existing?.title ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [data, setData] = useState<GuideData>(() =>
    existing ? { ...EMPTY, ...existing.data, callouts: existing.data.callouts ?? [] } : EMPTY,
  );
  const [steps, setSteps] = useState<StepForm[]>(() =>
    (existing?.data.steps ?? []).map((s) => ({ ...s, key: newKey() })),
  );
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  // assetId -> file name/url for thumbnails of images chosen this session.
  const [assets, setAssets] = useState<Record<string, LearningAsset>>({});

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (p: Partial<GuideData>) => {
    setData((d) => ({ ...d, ...p }));
    setDirty(true);
  };
  const patchStep = (key: string, p: Partial<GuideStepData>) => {
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)));
    setDirty(true);
  };
  const moveStep = (index: number, delta: -1 | 1) => {
    setSteps((list) => {
      const next = [...list];
      const j = index + delta;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setDirty(true);
  };

  const buildPayload = (): { title: string; slug?: string; data: GuideData } => ({
    title: title.trim(),
    ...(isNew && slug.trim() ? { slug: slug.trim() } : {}),
    data: {
      ...data,
      summary: data.summary.trim(),
      outcomes: clean(data.outcomes),
      related: data.related,
      callouts: (data.callouts ?? []).filter((c) => c.title.trim()),
      cta: data.cta?.label?.trim() && data.cta.href?.trim() ? data.cta : undefined,
      steps: steps.map((s) => ({
        title: s.title,
        body: s.body,
        image: s.image,
        tip: s.tip?.trim() || undefined,
        screenshot: s.image ? undefined : s.screenshot?.trim() || undefined,
        link: s.link?.label?.trim() && s.link.href?.trim() ? s.link : undefined,
      })),
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "learning"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      return isNew
        ? createLearning<GuideData>("guide", payload)
        : updateLearning<GuideData>("guide", id, { title: payload.title, data: payload.data });
    },
    onSuccess: (item: LearningItem<GuideData>) => {
      setDirty(false);
      refresh();
      toast.success(isNew ? "Guide created as a draft" : "Guide saved");
      if (isNew) router.replace(`/learning/guides/${item.id}`);
    },
    onError: (e) => toast.error(describeError(e, "Could not save the guide")),
  });

  const status = useMutation({
    mutationFn: (next: "draft" | "published") => setLearningStatus("guide", id, next),
    onSuccess: (item) => {
      refresh();
      toast.success(item.status === "published" ? "Guide published" : "Guide moved to draft");
    },
    onError: (e) => toast.error(describeError(e, "Could not change status")),
  });

  const remove = useMutation({
    mutationFn: () => deleteLearning("guide", id),
    onSuccess: () => {
      setDirty(false);
      refresh();
      toast.success("Guide deleted");
      router.replace("/learning");
    },
    onError: (e) => toast.error(describeError(e, "Could not delete the guide")),
  });

  const otherGuides = useMemo(
    () => (allGuides ?? []).filter((g) => g.slug !== slug),
    [allGuides, slug],
  );

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL;
  const canSave = title.trim().length > 0 && data.summary.trim().length > 0 && data.audience.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/learning"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Learning Hub
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "New guide" : title || "Guide"}
          </h1>
          {!isNew && existing ? (
            <Badge variant={existing.status === "published" ? "default" : "secondary"}>
              {existing.status === "published" ? "Published" : "Draft"}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && existing?.status === "published" && portalUrl ? (
            <a
              href={`${portalUrl}/learning/${existing.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              View on portal
            </a>
          ) : null}
          {!isNew ? (
            <Button
              type="button"
              variant="outline"
              disabled={status.isPending || dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() =>
                status.mutate(existing?.status === "published" ? "draft" : "published")
              }
            >
              {existing?.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          ) : null}
          <Button type="button" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {isNew ? "Create draft" : "Save changes"}
          </Button>
          {!isNew ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete guide"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4 text-destructive" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Title" htmlFor="g-title" className="sm:col-span-2">
          <Input
            id="g-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        {isNew ? (
          <Field
            label="Slug (optional)"
            htmlFor="g-slug"
            hint="Used in the guide's web address. Generated from the title when empty."
          >
            <Input
              id="g-slug"
              value={slug}
              placeholder="upload-your-first-dataset"
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </Field>
        ) : (
          <Field label="Slug" hint="Fixed after creation so existing links keep working.">
            <Input value={slug} readOnly disabled />
          </Field>
        )}
        <Field label="Last updated" htmlFor="g-updated">
          <Input
            id="g-updated"
            type="date"
            value={data.updated}
            onChange={(e) => patch({ updated: e.target.value })}
          />
        </Field>
        <Field label="Summary" htmlFor="g-summary" className="sm:col-span-2">
          <Textarea
            id="g-summary"
            rows={2}
            value={data.summary}
            onChange={(e) => patch({ summary: e.target.value })}
          />
        </Field>
        <Field label="Category" htmlFor="g-category">
          <NativeSelect<GuideCategory>
            id="g-category"
            value={data.category}
            onChange={(category) => patch({ category })}
            options={GUIDE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />
        </Field>
        <Field label="Level" htmlFor="g-level">
          <NativeSelect<GuideData["level"]>
            id="g-level"
            value={data.level}
            onChange={(level) => patch({ level })}
            options={["Beginner", "Intermediate", "Advanced"].map((v) => ({
              value: v as GuideData["level"],
              label: v,
            }))}
          />
        </Field>
        <Field label="Minutes to read" htmlFor="g-minutes">
          <Input
            id="g-minutes"
            type="number"
            min={1}
            max={600}
            value={data.minutes}
            onChange={(e) => patch({ minutes: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label="Icon" htmlFor="g-icon">
          <NativeSelect<GuideData["icon"]>
            id="g-icon"
            value={data.icon}
            onChange={(icon) => patch({ icon })}
            options={LEARNING_ICONS.map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Field label="Who is this for?" className="sm:col-span-2">
          <AudiencePicker value={data.audience} onChange={(audience) => patch({ audience })} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={data.featured}
            onChange={(e) => patch({ featured: e.target.checked })}
          />
          Feature this guide
        </label>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">What readers will learn</h2>
        <StringListEditor
          value={data.outcomes}
          onChange={(outcomes) => patch({ outcomes })}
          addLabel="Add outcome"
          placeholder="e.g. Upload a CSV and submit it for review"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Steps ({steps.length})</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setSteps((s) => [...s, { key: newKey(), title: "", body: "" }]);
              setDirty(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            Add step
          </Button>
        </div>

        {steps.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No steps yet.
          </p>
        ) : null}

        {steps.map((step, index) => {
          const asset = step.image ? assets[step.image.assetId] : undefined;
          return (
            <div key={step.key} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {index + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move step up"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move step down"
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete step"
                    onClick={() => {
                      setSteps((s) => s.filter((x) => x.key !== step.key));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </div>

              <Field label="Step title" htmlFor={`s-title-${step.key}`}>
                <Input
                  id={`s-title-${step.key}`}
                  value={step.title}
                  onChange={(e) => patchStep(step.key, { title: e.target.value })}
                />
              </Field>
              <Field label="Instructions" htmlFor={`s-body-${step.key}`}>
                <Textarea
                  id={`s-body-${step.key}`}
                  rows={3}
                  value={step.body}
                  onChange={(e) => patchStep(step.key, { body: e.target.value })}
                />
              </Field>
              <Field label="Tip (optional)" htmlFor={`s-tip-${step.key}`}>
                <Input
                  id={`s-tip-${step.key}`}
                  value={step.tip ?? ""}
                  onChange={(e) => patchStep(step.key, { tip: e.target.value })}
                />
              </Field>

              <div className="space-y-2">
                <p className="text-sm font-medium">Screenshot</p>
                {step.image ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed-redirect media from the API */}
                    <img
                      src={assetUrl(asset?.url ?? `/learning/assets/${step.image.assetId}/file`)}
                      alt={step.image.alt || step.title}
                      className="max-h-56 rounded-lg border"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label="Image description for screen readers"
                        placeholder="Describe the image (alt text)"
                        value={step.image.alt ?? ""}
                        onChange={(e) =>
                          patchStep(step.key, { image: { ...step.image!, alt: e.target.value } })
                        }
                      />
                      <Input
                        aria-label="Caption"
                        placeholder="Caption (optional)"
                        value={step.image.caption ?? ""}
                        onChange={(e) =>
                          patchStep(step.key, { image: { ...step.image!, caption: e.target.value } })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerFor(step.key)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => patchStep(step.key, { image: undefined })}
                      >
                        <X className="size-3.5" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {step.screenshot ? (
                      <p className="text-xs text-muted-foreground">
                        Placeholder shown to readers: &ldquo;{step.screenshot}&rdquo;
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setPickerFor(step.key)}
                    >
                      <ImageIcon className="size-3.5" aria-hidden />
                      Add screenshot
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Button text (optional)" htmlFor={`s-ll-${step.key}`}>
                  <Input
                    id={`s-ll-${step.key}`}
                    value={step.link?.label ?? ""}
                    onChange={(e) =>
                      patchStep(step.key, {
                        link: { label: e.target.value, href: step.link?.href ?? "" },
                      })
                    }
                  />
                </Field>
                <Field label="Button link (optional)" htmlFor={`s-lh-${step.key}`}>
                  <Input
                    id={`s-lh-${step.key}`}
                    placeholder="/upload or https://…"
                    value={step.link?.href ?? ""}
                    onChange={(e) =>
                      patchStep(step.key, {
                        link: { label: step.link?.label ?? "", href: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Callouts</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              patch({ callouts: [...(data.callouts ?? []), { tone: "tip", title: "", body: "" }] })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add callout
          </Button>
        </div>
        {(data.callouts ?? []).map((c, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_auto]">
            <NativeSelect<"tip" | "warning" | "info">
              aria-label="Callout type"
              value={c.tone}
              onChange={(tone) =>
                patch({ callouts: data.callouts!.map((x, j) => (j === i ? { ...x, tone } : x)) })
              }
              options={[
                { value: "tip", label: "Tip" },
                { value: "info", label: "Info" },
                { value: "warning", label: "Warning" },
              ]}
            />
            <div className="space-y-2">
              <Input
                aria-label="Callout title"
                placeholder="Title"
                value={c.title}
                onChange={(e) =>
                  patch({
                    callouts: data.callouts!.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
              <Textarea
                aria-label="Callout text"
                rows={2}
                value={c.body}
                onChange={(e) =>
                  patch({
                    callouts: data.callouts!.map((x, j) =>
                      j === i ? { ...x, body: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove callout"
              onClick={() => patch({ callouts: data.callouts!.filter((_, j) => j !== i) })}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Call-to-action text (optional)" htmlFor="g-cta-label">
          <Input
            id="g-cta-label"
            value={data.cta?.label ?? ""}
            onChange={(e) => patch({ cta: { label: e.target.value, href: data.cta?.href ?? "" } })}
          />
        </Field>
        <Field label="Call-to-action link (optional)" htmlFor="g-cta-href">
          <Input
            id="g-cta-href"
            placeholder="/upload"
            value={data.cta?.href ?? ""}
            onChange={(e) => patch({ cta: { label: data.cta?.label ?? "", href: e.target.value } })}
          />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Related guides</p>
          {otherGuides.length === 0 ? (
            <p className="text-xs text-muted-foreground">No other guides yet.</p>
          ) : (
            <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {otherGuides.map((g) => {
                const checked = data.related.includes(g.slug);
                return (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() =>
                        patch({
                          related: checked
                            ? data.related.filter((s) => s !== g.slug)
                            : [...data.related, g.slug],
                        })
                      }
                    />
                    <span className="truncate">{g.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <MediaPicker
        open={pickerFor !== null}
        onOpenChange={(open) => !open && setPickerFor(null)}
        onSelect={(asset) => {
          if (!pickerFor) return;
          setAssets((a) => ({ ...a, [asset.id]: asset }));
          const current = steps.find((s) => s.key === pickerFor);
          patchStep(pickerFor, {
            image: {
              assetId: asset.id,
              alt: current?.image?.alt ?? asset.alt ?? "",
              caption: current?.image?.caption ?? current?.screenshot ?? "",
            },
          });
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this guide?"
        description="It disappears from the portal and from any paths that list it. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={remove.isPending}
        closeOnConfirm={false}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
