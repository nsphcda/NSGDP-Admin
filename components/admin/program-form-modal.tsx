"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Target, Loader2, Save, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/forms/form-error";
import { useCreateProgram, useUpdateProgram } from "@/lib/hooks/usePrograms";
import { useDevelopmentPartners } from "@/lib/hooks/useDevelopmentPartners";
import type { AdminProgramme } from "@/lib/api/programs";
import { programFormSchema, defaultProgressModeForType, type ProgramFormData } from "@/lib/schemas/program";
import {
  PROGRESS_MODE_OPTIONS,
  tracksLgaCoverage,
  tracksOutcomeMetric,
} from "@/lib/constants/program-progress";
import { LgaMultiSelect } from "@/components/admin/lga-multi-select";
import { ProgrammePartnerPicker } from "@/components/admin/programme-partner-picker";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  objectivesFromEditorHtml,
  objectivesToEditorHtml,
} from "@/lib/objectives-html";
import { toast } from "sonner";

const PROGRAMME_TYPES: Array<{ value: ProgramFormData["type"]; label: string }> = [
  { value: "campaign", label: "Campaign" },
  { value: "surveillance", label: "Surveillance" },
  { value: "screening", label: "Screening" },
  { value: "training", label: "Training" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "research", label: "Research" },
  { value: "other", label: "Other" },
];

const PROGRAMME_STATUSES: Array<{ value: NonNullable<ProgramFormData["status"]>; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "suspended", label: "Suspended" },
];

interface ProgramFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present = editing; absent = creating */
  programme?: AdminProgramme;
}

function parseOptionalCount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Local calendar date as YYYY-MM-DD for date inputs */
function localDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ProgramFormModal({ open, onClose, programme }: ProgramFormModalProps) {
  const isEditing = !!programme;
  const [submitting, setSubmitting] = useState(false);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();

  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const { data: orgsData, isLoading: partnersLoading } = useDevelopmentPartners(1, 100);
  const developmentPartners = useMemo(() => orgsData?.data ?? [], [orgsData?.data]);
  const agencyOrg = useMemo(
    () => developmentPartners.find((org) => org.is_platform_owner),
    [developmentPartners],
  );
  // The agency owns every programme, so it is not offered as an assignable partner.
  const assignablePartners = useMemo(
    () => developmentPartners.filter((org) => !org.is_platform_owner),
    [developmentPartners],
  );
  const todayMin = useMemo(() => localDateInputValue(), []);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "campaign",
      status: "active",
      code: "",
      developmentPartnerId: "",
      targetLgas: [],
      startDate: "",
      endDate: "",
      objectives: "",
      progressMode: "combined",
      primaryMetric: "",
      targetCount: "",
    },
  });

  const programmeType = watch("type");
  const progressMode = watch("progressMode");
  const targetLgasSelected = watch("targetLgas");

  useEffect(() => {
    if (open) {
      setPartnerIds((programme?.partners ?? []).map((p) => p.id));
      const type = programme?.type ?? "campaign";
      reset({
        name: programme?.name ?? "",
        description: programme?.description ?? "",
        type,
        status:
          programme?.status === "archived"
            ? "active"
            : (programme?.status ?? "active"),
        code: programme?.code ?? "",
        developmentPartnerId: programme?.development_partner_id ?? agencyOrg?.id ?? "",
        targetLgas: programme?.target_lgas ?? [],
        startDate: programme?.start_date ? programme.start_date.split("T")[0] : "",
        endDate: programme?.end_date ? programme.end_date.split("T")[0] : "",
        objectives: objectivesToEditorHtml(programme?.objectives),
        progressMode:
          programme?.progress_mode ?? defaultProgressModeForType(type),
        primaryMetric:
          programme?.primary_metric && programme.primary_metric !== "LGAs covered"
            ? programme.primary_metric
            : "",
        targetCount: programme?.target_count?.toString() ?? "",
      });
    }
  }, [open, programme, reset, agencyOrg?.id]);

  useEffect(() => {
    if (open && !isEditing) {
      setValue("progressMode", defaultProgressModeForType(programmeType));
    }
  }, [programmeType, isEditing, open, setValue]);

  const startDateValue = watch("startDate");
  const endDateMin =
    startDateValue && startDateValue > todayMin ? startDateValue : todayMin;

  const onSubmit = async (data: ProgramFormData) => {
    if (!agencyOrg?.id) {
      toast.error("Agency development partner is not configured. Contact a super administrator.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: data.name,
        description: data.description,
        type: data.type,
        code: data.code || undefined,
        developmentPartnerId: isEditing ? (programme.development_partner_id ?? agencyOrg.id) : agencyOrg.id,
        partnerIds,
        targetLgas: data.targetLgas,
        startDate: data.startDate,
        endDate: data.endDate,
        objectives: objectivesFromEditorHtml(data.objectives),
        progressMode: data.progressMode,
        primaryMetric: tracksOutcomeMetric(data.progressMode)
          ? data.primaryMetric.trim()
          : undefined,
        targetCount: tracksOutcomeMetric(data.progressMode)
          ? parseOptionalCount(data.targetCount)
          : undefined,
      };

      if (isEditing) {
        await updateMutation.mutateAsync({
          slug: programme.slug,
          data: {
            ...payload,
            status: data.status,
          },
        });
        toast.success("Programme updated");
      } else {
        const created = await createMutation.mutateAsync(payload);
        toast.success(`Programme "${created.name}" created`);
      }
      onClose();
    } catch (error) {
      const err = error as { message?: string };
      toast.error(err?.message || `Failed to ${isEditing ? "update" : "create"} programme`);
    } finally {
      setSubmitting(false);
    }
  };

  const onInvalid = () => {
    toast.error("Please fix the highlighted fields before submitting.");
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5" />
            {isEditing ? "Edit Programme" : "Create Programme"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update programme details and progress metrics."
              : "Create a new health programme, campaign, or initiative. You can track progress and attach reports."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5" noValidate>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Basic Information
            </h3>

            <div>
              <Label htmlFor="name">
                Programme Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                className="mt-1.5"
                placeholder="e.g. 2026 Measles Vaccination Campaign"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <p className="mt-1 text-xs text-muted-foreground">At least 5 characters</p>
              <FormError message={errors.name?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="type">
                  Type <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue>
                          {(v: string) => PROGRAMME_TYPES.find((t) => t.value === v)?.label ?? "Select type"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PROGRAMME_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FormError message={errors.type?.message} />
              </div>

              {isEditing && (
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue>
                            {(v: string) => PROGRAMME_STATUSES.find((s) => s.value === v)?.label ?? v}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PROGRAMME_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                className="mt-1.5"
                rows={3}
                placeholder="Brief description of the programme's goals and activities..."
                aria-invalid={!!errors.description}
                {...register("description")}
              />
              <p className="mt-1 text-xs text-muted-foreground">At least 10 characters</p>
              <FormError message={errors.description?.message} />
            </div>

            <div>
              <Label htmlFor="targetLgas">
                Target LGAs <span className="text-destructive">*</span>
              </Label>
              <div className="mt-1.5">
                <Controller
                  name="targetLgas"
                  control={control}
                  render={({ field }) => (
                    <LgaMultiSelect
                      id="targetLgas"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={submitting}
                    />
                  )}
                />
              </div>
              <FormError message={errors.targetLgas?.message} />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Who runs it
            </h3>
            <ProgrammePartnerPicker
              options={assignablePartners}
              value={partnerIds}
              onChange={setPartnerIds}
              disabled={submitting}
              loading={partnersLoading}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Timeline
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="startDate">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  className="mt-1.5"
                  min={todayMin}
                  aria-invalid={!!errors.startDate}
                  {...register("startDate")}
                />
                <FormError message={errors.startDate?.message} />
              </div>

              <div>
                <Label htmlFor="endDate">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  className="mt-1.5"
                  min={endDateMin}
                  aria-invalid={!!errors.endDate}
                  {...register("endDate")}
                />
                <FormError message={errors.endDate?.message} />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Progress Tracking
            </h3>

            <div>
              <Label htmlFor="objectives">Objectives</Label>
              <div className="mt-1.5">
                <Controller
                  name="objectives"
                  control={control}
                  render={({ field }) => (
                    <RichTextEditor
                      id="objectives"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={submitting}
                      placeholder="List programme objectives — use bullets, bold, and line breaks as needed"
                    />
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use the toolbar for bold, italics, and bullet or numbered lists.
              </p>
            </div>

            <div>
              <Label htmlFor="progressMode">How to track progress</Label>
              <Controller
                name="progressMode"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="progressMode" className="mt-1.5">
                      <SelectValue>
                        {(v: string) =>
                          PROGRESS_MODE_OPTIONS.find((o) => o.value === v)?.label ??
                          "Select tracking mode"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PROGRESS_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {PROGRESS_MODE_OPTIONS.find((o) => o.value === progressMode)?.description}
              </p>
              <FormError message={errors.progressMode?.message} />
            </div>

            {tracksLgaCoverage(progressMode) && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">LGA coverage target</p>
                <p className="mt-1 text-muted-foreground">
                  {targetLgasSelected.length} LGA
                  {targetLgasSelected.length === 1 ? "" : "s"} selected above.
                  Mark covered LGAs in <strong>Update progress</strong> after saving.
                </p>
              </div>
            )}

            {tracksOutcomeMetric(progressMode) && (
              <>
                <div>
                  <Label htmlFor="primaryMetric">
                    Outcome label <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="primaryMetric"
                    className="mt-1.5"
                    placeholder="e.g. Children vaccinated, CHEWs trained, cases investigated"
                    aria-invalid={!!errors.primaryMetric}
                    {...register("primaryMetric")}
                  />
                  <FormError message={errors.primaryMetric?.message} />
                </div>

                <div>
                  <Label htmlFor="targetCount">
                    Outcome target <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="targetCount"
                    type="number"
                    min={1}
                    className="mt-1.5"
                    placeholder="50000"
                    aria-invalid={!!errors.targetCount}
                    {...register("targetCount")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current reach is updated in Update progress after saving.
                  </p>
                  <FormError message={errors.targetCount?.message} />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              <X className="size-4 mr-1.5" />
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  {isEditing ? "Saving..." : "Creating..."}
                </>
              ) : (
                <>
                  <Save className="size-4 mr-1.5" />
                  {isEditing ? "Save Changes" : "Create Programme"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
