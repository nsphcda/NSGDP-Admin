"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Upload, MapPin, Scale, Settings, X, Lock, Search } from "lucide-react";
import { Stepper } from "@/components/forms/stepper";
import { FileUploadArea, type UploadedFile } from "@/components/forms/file-upload-area";
import { FieldLabelTooltip } from "@/components/forms/field-label-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { METRIC_TONE, Panel } from "@/components/admin/admin-analytics-ui";
import { HelpTip } from "@/components/admin/help-tip";
import { DevelopmentPartnerCombobox } from "@/components/admin/development-partner-combobox";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import { useAuth } from "@/lib/auth";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDataset, useSubmitDataset } from "@/lib/hooks/useDatasets";
import { useDevelopmentPartners } from "@/lib/hooks/useDevelopmentPartners";
import { useDepartments, useMyDepartments } from "@/lib/hooks/useDepartments";
import { useCategories } from "@/lib/hooks/useCategories";
import { uploadFile } from "@/lib/api/uploads";
import { NIGER_STATE_LGAS } from "@/lib/constants/core";
import {
  DEFAULT_DATASET_LICENSE,
  UPDATE_FREQUENCY_OPTIONS,
} from "@/lib/constants/dataset-metadata";
import { UPLOAD_FIELD_TOOLTIPS, UPLOAD_CONTACT_EMAIL_TIP, UPLOAD_DRAFT_TIP, UPLOAD_PAGE_AGENCY_TIP, UPLOAD_PAGE_TIP, UPLOAD_PREFILL_TIP, UPLOAD_STEP_TIPS, UPLOAD_STEPS_PANEL_TIP, UPLOAD_SUBMIT_TIP } from "@/lib/constants/upload-tooltips";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import type { DatasetFormat, DatasetVisibility } from "@/lib/api/datasets";
import { cn } from "@/lib/utils";

interface UploadDraft {
  currentStep: number;
  developmentPartnerId: string;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  selectedLGAs: string[];
  temporalCoverageStart: string;
  temporalCoverageEnd: string;
  diseaseIndicators: string[];
  methodology: string;
  limitations: string;
  visibility: DatasetVisibility;
  responsibleDept: string;
  contactPerson: string;
  contactEmail: string;
  updateFrequency: string;
}

const steps = [
  { id: 1, name: "Basic Info", icon: FileText },
  { id: 2, name: "Coverage & Indicators", icon: MapPin },
  { id: 3, name: "Upload Files", icon: Upload },
  { id: 4, name: "Governance", icon: Scale },
  { id: 5, name: "Contact & Settings", icon: Settings },
];

/** The step where files are attached. Drafts never resume past it. */
const FILE_STEP = 3;

const FORMAT_BY_EXTENSION: Record<string, DatasetFormat> = {
  csv: "csv",
  xlsx: "excel",
  xls: "excel",
  json: "json",
  gpkg: "geopackage",
};

function StepHeading({
  title,
  description,
  tip,
}: {
  title: string;
  description: string;
  tip?: string;
}) {
  return (
    <div className="border-b pb-4">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        {title}
        {tip ? <HelpTip content={tip} label={`About ${title}`} /> : null}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = METRIC_TONE.primary;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
        t.well,
        t.icon,
      )}
    >
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

export default function AdminUploadDatasetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetOrgId = searchParams.get("orgId") ?? undefined;
  const presetAgency = searchParams.get("agency") === "1";
  const { user } = useAuth();
  const { isLoading: permissionsLoading, can, isSuperAdmin } = useAdminAccess();
  const canUpload = can("create:datasets");
  const { toast } = useToast();
  const createMutation = useCreateDataset();
  const submitMutation = useSubmitDataset();
  const { data: orgsData } = useDevelopmentPartners(1, 200);
  const { data: categoriesData } = useCategories();
  // Only relevant for agency uploads — a dev-partner org's "responsible
  // department" is their own internal team name, unrelated to our staff
  // Department entity, so we only fetch/offer this dropdown in agency mode.
  // Super admins pick from every department; other staff only from the
  // department(s) they actually belong to.
  const { data: allDepartmentsData } = useDepartments(presetAgency && isSuperAdmin);
  const { data: myDepartmentsData } = useMyDepartments(presetAgency && !isSuperAdmin && user?.role === "staff");
  const departmentOptions = isSuperAdmin ? allDepartmentsData ?? [] : myDepartmentsData ?? [];

  // Draft autosave — lets the uploader leave mid-flow and pick up on the
  // same step later. Scoped per upload context (agency vs a specific org)
  // so switching context doesn't bleed a stale draft into the wrong form.
  // Files can't be persisted this way (no way to serialize a File handle to
  // localStorage), so uploadedFiles is deliberately excluded — the draft
  // banner below tells the uploader to re-attach files if they left mid-way.
  //
  // Restored via lazy useState initializers (computed once, at first
  // render) rather than an effect that calls setState after mount — that
  // pattern causes an extra cascading render per restored field.
  const draftKey = presetAgency
    ? "upload-draft:agency"
    : presetOrgId
      ? `upload-draft:org-${presetOrgId}`
      : "upload-draft:general";

  const [initialDraft] = useState<UploadDraft | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as UploadDraft) : null;
    } catch {
      return null;
    }
  });
  const [draftRestored, setDraftRestored] = useState(() => initialDraft !== null);

  // Files cannot be restored, and steps 4-5 are only reachable once a file is
  // attached, so a resumed draft never lands past the Upload Files step.
  const [currentStep, setCurrentStep] = useState(
    Math.min(initialDraft?.currentStep ?? 1, FILE_STEP),
  );
  const [saving, setSaving] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const [developmentPartnerId, setDevelopmentPartnerId] = useState(
    initialDraft?.developmentPartnerId ?? presetOrgId ?? "",
  );
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? "");
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [selectedLGAs, setSelectedLGAs] = useState<string[]>(initialDraft?.selectedLGAs ?? []);
  const [lgaFilter, setLgaFilter] = useState("");
  const filteredLGAs = NIGER_STATE_LGAS.filter((lga) =>
    lga.toLowerCase().includes(lgaFilter.trim().toLowerCase())
  );
  const [temporalCoverageStart, setTemporalCoverageStart] = useState(
    initialDraft?.temporalCoverageStart ?? "",
  );
  const [temporalCoverageEnd, setTemporalCoverageEnd] = useState(initialDraft?.temporalCoverageEnd ?? "");
  const [diseaseIndicators, setDiseaseIndicators] = useState<string[]>(initialDraft?.diseaseIndicators ?? []);
  const [indicatorInput, setIndicatorInput] = useState("");
  const [methodology, setMethodology] = useState(initialDraft?.methodology ?? "");
  const [limitations, setLimitations] = useState(initialDraft?.limitations ?? "");
  const [visibility, setVisibility] = useState<DatasetVisibility>(initialDraft?.visibility ?? "public");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // The dataset row is created before its files are sent. Remember it, and
  // which files the server has already accepted, so a retry after a failed
  // upload continues on the same dataset instead of creating a duplicate.
  const [createdDataset, setCreatedDataset] = useState<{
    id: string;
    slug: string;
  } | null>(null);
  const attachedFileKeys = useRef<Set<string>>(new Set());
  const [responsibleDept, setResponsibleDept] = useState(initialDraft?.responsibleDept ?? "");
  const [contactPerson, setContactPerson] = useState(initialDraft?.contactPerson ?? "");
  const [contactEmail, setContactEmail] = useState(initialDraft?.contactEmail ?? "");
  const [updateFrequency, setUpdateFrequency] = useState(initialDraft?.updateFrequency ?? "");

  useEffect(() => {
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          currentStep,
          developmentPartnerId,
          title,
          description,
          categoryId,
          tags,
          selectedLGAs,
          temporalCoverageStart,
          temporalCoverageEnd,
          diseaseIndicators,
          methodology,
          limitations,
          visibility,
          responsibleDept,
          contactPerson,
          contactEmail,
          updateFrequency,
        } satisfies UploadDraft),
      );
    } catch {
      // Storage full or unavailable (e.g. private browsing) — drafts just
      // won't persist this session, not worth surfacing as an error.
    }
  }, [
    draftKey,
    currentStep,
    developmentPartnerId,
    title,
    description,
    categoryId,
    tags,
    selectedLGAs,
    temporalCoverageStart,
    temporalCoverageEnd,
    diseaseIndicators,
    methodology,
    limitations,
    visibility,
    responsibleDept,
    contactPerson,
    contactEmail,
    updateFrequency,
  ]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Ignore — nothing to clean up if storage isn't available.
    }
  };

  const startOver = () => {
    clearDraft();
    setDraftRestored(false);
    setCurrentStep(1);
    setCreatedDataset(null);
    attachedFileKeys.current = new Set();
    setDevelopmentPartnerId(presetOrgId ?? "");
    setTitle("");
    setDescription("");
    setCategoryId("");
    setTags([]);
    setSelectedLGAs([]);
    setTemporalCoverageStart("");
    setTemporalCoverageEnd("");
    setDiseaseIndicators([]);
    setMethodology("");
    setLimitations("");
    setVisibility("public");
    setResponsibleDept("");
    setContactPerson("");
    setContactEmail("");
    setUpdateFrequency("");
    setUploadedFiles([]);
  };

  // Off by default — only fills the form when explicitly opted into via the
  // small checkbox in the header, and clears back out if unchecked.
  const [prefillTestData, setPrefillTestData] = useState(false);
  const togglePrefill = (checked: boolean) => {
    setPrefillTestData(checked);
    if (checked) {
      setTitle(`Test Health Dataset ${new Date().getFullYear()} - ${Date.now().toString().slice(-6)}`);
      setDescription(
        "Sample dataset used for testing the admin upload flow and data validation. Contains placeholder health data for Niger State."
      );
      setTags(["health", "test", "niger-state"]);
      setSelectedLGAs(["Minna", "Suleja", "Bida"]);
      setTemporalCoverageStart("2025-01-01");
      setTemporalCoverageEnd("2025-12-31");
      setDiseaseIndicators(["Confirmed cases", "Deaths"]);
      setMethodology("Facility-based routine reporting via DHIS2");
      setLimitations("Data may have reporting delays from rural facilities");
      setResponsibleDept("Disease Surveillance Unit");
      setContactPerson("Jane Doe");
      setContactEmail("jane.doe@example.org");
      setUpdateFrequency("Monthly");
    } else {
      setTitle("");
      setDescription("");
      setTags([]);
      setSelectedLGAs([]);
      setTemporalCoverageStart("");
      setTemporalCoverageEnd("");
      setDiseaseIndicators([]);
      setMethodology("");
      setLimitations("");
      setResponsibleDept("");
      setContactPerson("");
      setContactEmail("");
      setUpdateFrequency("");
    }
  };

  const developmentPartners = useMemo(() => orgsData?.data ?? [], [orgsData?.data]);
  const categories = useMemo(() => categoriesData?.data ?? [], [categoriesData?.data]);
  const effectiveDevelopmentPartnerId =
    developmentPartnerId || (presetAgency ? developmentPartners.find((o) => o.is_platform_owner)?.id ?? "" : "");
  const effectiveCategoryId = categoryId || (prefillTestData ? categories[0]?.id ?? "" : "");
  const agencyOrg = developmentPartners.find((o) => o.is_platform_owner);
  const currentStepMeta = steps.find((step) => step.id === currentStep);

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const addIndicator = () => {
    if (indicatorInput.trim() && !diseaseIndicators.includes(indicatorInput.trim())) {
      setDiseaseIndicators([...diseaseIndicators, indicatorInput.trim()]);
      setIndicatorInput("");
    }
  };

  const removeIndicator = (indicator: string) => {
    setDiseaseIndicators(diseaseIndicators.filter((i) => i !== indicator));
  };

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!effectiveDevelopmentPartnerId) errors.developmentPartnerId = "Select a development partner";
    if (title.trim().length < 5) errors.title = "Title must be at least 5 characters";
    if (description.trim().length < 20) errors.description = "Description must be at least 20 characters";
    if (!effectiveCategoryId) errors.categoryId = "Select a category";
    if (tags.length === 0) errors.tags = "Add at least one tag";
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = () => {
    const errors: Record<string, string> = {};
    if (selectedLGAs.length === 0) errors.lgas = "Select at least one LGA";
    if (!temporalCoverageStart) errors.temporalCoverageStart = "Start date is required";
    if (!temporalCoverageEnd) errors.temporalCoverageEnd = "End date is required";
    if (
      temporalCoverageStart &&
      temporalCoverageEnd &&
      new Date(temporalCoverageStart) > new Date(temporalCoverageEnd)
    ) {
      errors.temporalCoverageEnd = "Start date must be before end date";
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep3 = () => {
    if (uploadedFiles.length === 0) {
      setStepErrors({ files: "Upload at least one file" });
      return false;
    }
    setStepErrors({});
    return true;
  };

  const handleSubmit = async (isDraft: boolean) => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }
    // Require a file for every dataset, draft or submitted — mirrors the
    // contributor-facing upload wizard's rule.
    if (!validateStep3()) {
      setCurrentStep(3);
      return;
    }
    setSaving(true);

    try {
      const firstExt = uploadedFiles[0]?.name.split(".").pop()?.toLowerCase();
      const format: DatasetFormat = (firstExt && FORMAT_BY_EXTENSION[firstExt]) || "csv";

      // Always create as a draft. Submission for review happens only after
      // every file has been accepted by the server, so a failed upload can
      // never leave a "pending" dataset with no file in the review queue.
      let dataset = createdDataset;
      if (!dataset) {
        const created = await createMutation.mutateAsync({
          title,
          description,
          categoryId: effectiveCategoryId,
          format,
          visibility,
          tags,
          geographicCoverage: selectedLGAs.join(", "),
          temporalCoverageStart: temporalCoverageStart || undefined,
          temporalCoverageEnd: temporalCoverageEnd || undefined,
          diseaseIndicators: diseaseIndicators.length > 0 ? diseaseIndicators : undefined,
          license: DEFAULT_DATASET_LICENSE,
          methodology: methodology || undefined,
          limitations: limitations || undefined,
          developmentPartnerId: effectiveDevelopmentPartnerId,
          responsibleDept: responsibleDept || undefined,
          contactPerson: contactPerson || undefined,
          contactEmail: contactEmail || undefined,
          updateFrequency: updateFrequency || undefined,
          status: "draft",
        });
        dataset = { id: created.id, slug: created.slug };
        setCreatedDataset(dataset);
      }

      for (const uploadedFile of uploadedFiles) {
        const key = `${uploadedFile.name}:${uploadedFile.size}:${uploadedFile.file.lastModified}`;
        if (attachedFileKeys.current.has(key)) continue;
        try {
          await uploadFile(uploadedFile.file, dataset.id);
        } catch (uploadError) {
          toast({
            title: "File upload failed",
            description: `${uploadedFile.name}: ${
              uploadError instanceof Error ? uploadError.message : "upload failed"
            }. The dataset is saved as a draft and was not submitted. Fix the file and press the button again to retry.`,
            variant: "destructive",
          });
          return;
        }
        attachedFileKeys.current.add(key);
      }

      if (!isDraft) {
        try {
          await submitMutation.mutateAsync(dataset.slug);
        } catch (submitError) {
          toast({
            title: "Files uploaded, but submitting failed",
            description: `${
              submitError instanceof Error ? submitError.message : "Could not submit for review"
            }. The dataset is saved as a draft with its files; press Submit again to retry.`,
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Success",
        description: isDraft
          ? "Dataset saved as draft"
          : `Dataset created${uploadedFiles.length ? ` with ${uploadedFiles.length} file(s)` : ""} and submitted for review`,
      });
      clearDraft();
      router.push(`/datasets/${dataset.slug}`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create dataset",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!permissionsLoading && !canUpload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="Uploading a dataset requires create:datasets. Ask a super_admin to grant your group this permission."
        />
      </div>
    );
  }

  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="mx-auto h-[32rem] w-full max-w-4xl rounded-2xl" />
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {presetAgency ? "Upload to agency" : "Upload dataset"}
            <HelpTip
              content={presetAgency ? UPLOAD_PAGE_AGENCY_TIP : UPLOAD_PAGE_TIP}
              label="About uploading a dataset"
            />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {presetAgency
              ? `Create a dataset owned by ${agencyOrg?.name ?? "the platform agency"}`
              : "Create a new dataset on behalf of a development partner"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium tabular-nums",
              METRIC_TONE.info.well,
              METRIC_TONE.info.icon,
            )}
          >
            Step {currentStep} of {steps.length}
          </Badge>
          <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-xs text-muted-foreground">
            <Checkbox
              checked={prefillTestData}
              onCheckedChange={(checked) => togglePrefill(!!checked)}
            />
            Prefill test data
            <HelpTip content={UPLOAD_PREFILL_TIP} label="About prefill test data" />
          </label>
        </div>
      </div>

      {draftRestored && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Resumed your in-progress draft. Files aren&apos;t saved between visits, so re-attach
            them on this step before continuing.
          </p>
          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={startOver}>
            Start over
          </Button>
        </div>
      )}

      {/* Mobile stepper: horizontal at top */}
      <Panel
        title="Upload progress"
        titleTip={UPLOAD_STEPS_PANEL_TIP}
        description={currentStepMeta ? `Current step: ${currentStepMeta.name}` : undefined}
        icon={Upload}
        tone="info"
        className="lg:hidden"
      >
        <Stepper
          steps={steps}
          currentStep={currentStep}
          onStepClick={(step) => step < currentStep && setCurrentStep(step)}
        />
      </Panel>

      {/* Desktop: vertical stepper + form side by side */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Vertical stepper sidebar (desktop only) */}
        <aside className="hidden lg:block">
          <Panel title="Upload steps" titleTip={UPLOAD_STEPS_PANEL_TIP} icon={Upload} tone="primary" className="sticky top-6">
            <Stepper
              steps={steps}
              currentStep={currentStep}
              onStepClick={(step) => step < currentStep && setCurrentStep(step)}
              orientation="vertical"
            />
          </Panel>
        </aside>

        {/* Form content */}
        <section className="overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
        {currentStep === 1 && (
          <div className="space-y-6">
            <StepHeading
              title="Basic information"
              description="Identify the owning development partner and describe the dataset clearly."
              tip={UPLOAD_STEP_TIPS.basic}
            />

            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="organisation"
                  label="Development Partner"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.organisation}
                />
                <DevelopmentPartnerCombobox
                  id="organisation"
                  developmentPartners={developmentPartners}
                  value={effectiveDevelopmentPartnerId}
                  onValueChange={setDevelopmentPartnerId}
                />
                {stepErrors.developmentPartnerId && (
                  <p className="text-xs text-destructive">{stepErrors.developmentPartnerId}</p>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="title"
                  label="Dataset title"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.datasetName}
                />
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Niger State Health Facilities 2024"
                  aria-required="true"
                />
                {stepErrors.title && <p className="text-xs text-destructive">{stepErrors.title}</p>}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="description"
                  label="Description"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.description}
                />
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what this dataset contains..."
                  aria-required="true"
                />
                {stepErrors.description && (
                  <p className="text-xs text-destructive">{stepErrors.description}</p>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="category"
                  label="Programme area or category"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.category}
                />
                <CategoryCombobox
                  id="category"
                  categories={categories}
                  value={effectiveCategoryId}
                  onValueChange={setCategoryId}
                />
                {stepErrors.categoryId && (
                  <p className="text-xs text-destructive">{stepErrors.categoryId}</p>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="tags"
                  label="Tags"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.tags}
                />
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="Add tags (press Enter)"
                  />
                  <Button type="button" onClick={addTag} variant="outline" className="shrink-0">
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((tag) => (
                      <TagChip key={tag} label={tag} onRemove={() => removeTag(tag)} />
                    ))}
                  </div>
                )}
                {stepErrors.tags && <p className="text-xs text-destructive">{stepErrors.tags}</p>}
              </div>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button onClick={() => validateStep1() && setCurrentStep(2)}>
                Next: Coverage and indicators
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <StepHeading
              title="Coverage and indicators"
              description="Define where and when the data applies, plus the indicators it contains."
              tip={UPLOAD_STEP_TIPS.coverage}
            />

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FieldLabelTooltip
                    label="LGA coverage"
                    required
                    tooltip={UPLOAD_FIELD_TOOLTIPS.lgas}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedLGAs.length === NIGER_STATE_LGAS.length) {
                        setSelectedLGAs([]);
                      } else {
                        setSelectedLGAs([...NIGER_STATE_LGAS]);
                      }
                    }}
                    className="h-8 text-xs font-medium"
                  >
                    {selectedLGAs.length === NIGER_STATE_LGAS.length ? "Clear All" : "Select All (25)"}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={lgaFilter}
                    onChange={(e) => setLgaFilter(e.target.value)}
                    placeholder="Filter LGAs…"
                    className="pl-9"
                  />
                </div>
                <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-4 sm:grid-cols-3">
                  {filteredLGAs.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                      No LGAs match &ldquo;{lgaFilter}&rdquo;
                    </p>
                  ) : (
                    filteredLGAs.map((lga) => (
                      <label key={lga} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedLGAs.includes(lga)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedLGAs([...selectedLGAs, lga]);
                            else setSelectedLGAs(selectedLGAs.filter((l) => l !== lga));
                          }}
                          className="rounded"
                        />
                        {lga}
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedLGAs.length} of {NIGER_STATE_LGAS.length} LGAs selected
                </p>
                {stepErrors.lgas && <p className="text-xs text-destructive">{stepErrors.lgas}</p>}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  label="Reporting period"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.reportingPeriod}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="temporalCoverageStart" className="text-xs font-normal text-muted-foreground">
                      Start date
                    </Label>
                    <Input
                      id="temporalCoverageStart"
                      type="date"
                      value={temporalCoverageStart}
                      onChange={(e) => setTemporalCoverageStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="temporalCoverageEnd" className="text-xs font-normal text-muted-foreground">
                      End date
                    </Label>
                    <Input
                      id="temporalCoverageEnd"
                      type="date"
                      value={temporalCoverageEnd}
                      onChange={(e) => setTemporalCoverageEnd(e.target.value)}
                    />
                  </div>
                </div>
                {(stepErrors.temporalCoverageStart || stepErrors.temporalCoverageEnd) && (
                  <p className="text-xs text-destructive">
                    {stepErrors.temporalCoverageStart || stepErrors.temporalCoverageEnd}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="diseaseIndicators"
                  label="Disease or health indicators"
                  tooltip={UPLOAD_FIELD_TOOLTIPS.diseaseIndicators}
                />
                <div className="flex gap-2">
                  <Input
                    id="diseaseIndicators"
                    value={indicatorInput}
                    onChange={(e) => setIndicatorInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIndicator())}
                    placeholder="e.g., Confirmed cases (press Enter)"
                  />
                  <Button type="button" onClick={addIndicator} variant="outline" className="shrink-0">
                    Add
                  </Button>
                </div>
                {diseaseIndicators.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {diseaseIndicators.map((indicator) => (
                      <TagChip
                        key={indicator}
                        label={indicator}
                        onRemove={() => removeIndicator(indicator)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                Back
              </Button>
              <Button onClick={() => validateStep2() && setCurrentStep(3)}>Next: Upload files</Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <StepHeading
              title="Upload files"
              description="CSV, Excel, JSON, or GeoPackage only. For PDF and other document files, use Documents."
              tip={UPLOAD_STEP_TIPS.files}
            />

            <div className="space-y-2">
              <FieldLabelTooltip
                label="Data files"
                required
                tooltip={UPLOAD_FIELD_TOOLTIPS.files}
              />
              <FileUploadArea files={uploadedFiles} onFilesChange={setUploadedFiles} />
              {stepErrors.files ? (
                <p className="text-sm text-destructive">{stepErrors.files}</p>
              ) : null}
            </div>

            <div className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Back
              </Button>
              <Button onClick={() => validateStep3() && setCurrentStep(4)}>Next: Governance</Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <StepHeading
              title="Governance"
              description="Document collection methodology and known data limitations."
              tip={UPLOAD_STEP_TIPS.governance}
            />

            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="methodology"
                  label="Methodology"
                  tooltip={UPLOAD_FIELD_TOOLTIPS.methodology}
                />
                <Textarea
                  id="methodology"
                  value={methodology}
                  onChange={(e) => setMethodology(e.target.value)}
                  rows={3}
                  placeholder="e.g., Facility-based routine reporting via DHIS2"
                />
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="limitations"
                  label="Known limitations"
                  tooltip={UPLOAD_FIELD_TOOLTIPS.limitations}
                />
                <Textarea
                  id="limitations"
                  value={limitations}
                  onChange={(e) => setLimitations(e.target.value)}
                  rows={3}
                  placeholder="e.g., Reporting delays from rural facilities"
                />
              </div>
            </div>

            <div className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                Back
              </Button>
              <Button onClick={() => setCurrentStep(5)}>Next: Contact and settings</Button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <StepHeading
              title="Contact and settings"
              description="Add stewardship contacts, update frequency, and access visibility."
              tip={UPLOAD_STEP_TIPS.contact}
            />

            <div className="space-y-4">
              {(!presetAgency || isSuperAdmin || departmentOptions.length > 0) && (
              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="responsibleDept"
                  label="Responsible department"
                  tooltip={UPLOAD_FIELD_TOOLTIPS.responsibleDept}
                />
                {presetAgency ? (
                  <Select value={responsibleDept} onValueChange={(v) => setResponsibleDept(v || "")}>
                    <SelectTrigger id="responsibleDept" className="w-full">
                      <SelectValue placeholder={isSuperAdmin ? "Select a department" : "Select your department"} />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentOptions.map((dept) => (
                        <SelectItem key={dept.id} value={dept.name}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="responsibleDept"
                    value={responsibleDept}
                    onChange={(e) => setResponsibleDept(e.target.value)}
                    placeholder="e.g., Disease Surveillance Unit"
                  />
                )}
              </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabelTooltip
                    htmlFor="contactPerson"
                    label="Contact person"
                    tooltip={UPLOAD_FIELD_TOOLTIPS.contactPerson}
                  />
                  <Input
                    id="contactPerson"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g., Jane Doe"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabelTooltip
                    htmlFor="contactEmail"
                    label="Contact email"
                    tooltip={UPLOAD_CONTACT_EMAIL_TIP}
                  />
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="e.g., jane.doe@example.org"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="updateFrequency"
                  label="Update frequency"
                  tooltip={UPLOAD_FIELD_TOOLTIPS.updateFrequency}
                />
                <Select value={updateFrequency} onValueChange={(v) => setUpdateFrequency(v || "")}>
                  <SelectTrigger id="updateFrequency" className="w-full">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {UPDATE_FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FieldLabelTooltip
                  htmlFor="visibility"
                  label="Visibility"
                  required
                  tooltip={UPLOAD_FIELD_TOOLTIPS.visibility}
                />
                <Select value={visibility} onValueChange={(v) => v && setVisibility(v as DatasetVisibility)}>
                  <SelectTrigger id="visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — anyone can view and download</SelectItem>
                    <SelectItem value="restricted">Restricted — users must request access</SelectItem>
                    <SelectItem value="private">Private — only this development partner can access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(4)}>
                Back
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit(true)}
                    disabled={saving || uploadedFiles.length === 0}
                    title={uploadedFiles.length === 0 ? "Upload a file first" : ""}
                  >
                    Save as draft
                  </Button>
                  <HelpTip content={UPLOAD_DRAFT_TIP} label="About save as draft" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={saving || uploadedFiles.length === 0}
                    title={uploadedFiles.length === 0 ? "Upload a file first" : ""}
                  >
                    {saving ? "Submitting..." : "Submit for review"}
                  </Button>
                  <HelpTip content={UPLOAD_SUBMIT_TIP} label="About submit for review" />
                </div>
              </div>
            </div>
          </div>
        )}
        </section>
      </div>
    </div>
    </TooltipProvider>
  );
}
