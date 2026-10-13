"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProgramReport,
  useDeleteProgramReport,
  useProgramReports,
} from "@/lib/hooks/usePrograms";
import { archiveDocument, downloadDocument } from "@/lib/api/documents";
import type { AdminDocument } from "@/lib/api/documents";
import { uploadFile } from "@/lib/api/uploads";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/forms/form-error";
import { formatDate } from "@/lib/utils/date";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ReportFormData {
  title: string;
  description: string;
  author: string;
}

function UploadReportDialog({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const createMutation = useCreateProgramReport();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReportFormData>({
    defaultValues: { title: "", description: "", author: "" },
  });

  const close = () => {
    if (submitting) return;
    reset();
    setFile(null);
    setFileError(null);
    onClose();
  };

  const onSubmit = async (data: ReportFormData) => {
    if (!file) {
      setFileError("Select a report file");
      return;
    }
    setSubmitting(true);
    try {
      const report = await createMutation.mutateAsync({
        slug,
        data: {
          title: data.title,
          description: data.description,
          author: data.author || undefined,
        },
      });
      try {
        await uploadFile(file, undefined, report.id);
      } catch (uploadError) {
        // Do not leave a published report without a file behind.
        try {
          await archiveDocument(report.slug);
        } catch {
          // best effort
        }
        throw uploadError;
      }
      await queryClient.invalidateQueries({ queryKey: ["programme-reports", slug] });
      toast.success("Report published to the programme");
      reset();
      setFile(null);
      onClose();
    } catch (error) {
      toast.error((error as { message?: string })?.message || "Failed to upload report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Upload programme report
          </DialogTitle>
          <DialogDescription>
            The report appears on the programme as soon as the upload finishes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="report-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="report-title"
              className="mt-1.5"
              placeholder="Q1 2026 Progress Report"
              {...register("title", {
                required: "Title is required",
                minLength: { value: 5, message: "At least 5 characters" },
              })}
            />
            <FormError message={errors.title?.message} />
          </div>

          <div>
            <Label htmlFor="report-description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="report-description"
              className="mt-1.5"
              rows={3}
              placeholder="Reporting period, scope, and key findings…"
              {...register("description", {
                required: "Description is required",
                minLength: { value: 10, message: "At least 10 characters" },
              })}
            />
            <FormError message={errors.description?.message} />
          </div>

          <div>
            <Label htmlFor="report-author">Author / Owning unit</Label>
            <Input id="report-author" className="mt-1.5" placeholder="DPRS" {...register("author")} />
          </div>

          <div>
            <Label htmlFor="report-file">
              File <span className="text-destructive">*</span>
            </Label>
            <Input
              id="report-file"
              type="file"
              accept={ACCEPT}
              className="mt-1.5"
              aria-invalid={!!fileError}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                if (next) setFileError(null);
              }}
            />
            <FormError message={fileError ?? undefined} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !file}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 size-4" />
                  Upload report
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramReportsCard({
  slug,
  canUpload,
  canDelete,
}: {
  slug: string;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const reportsQuery = useProgramReports(slug);
  const deleteMutation = useDeleteProgramReport();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reports = reportsQuery.data ?? [];

  const handleDownload = async (report: AdminDocument) => {
    setDownloading(report.id);
    try {
      const { downloadUrl } = await downloadDocument(report.slug);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as { message?: string })?.message || "Could not download this report");
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = () => {
    if (!toDelete) return;
    deleteMutation.mutate(
      { slug, reportId: toDelete.id },
      {
        onSuccess: () => {
          toast.success("Report removed");
          setToDelete(null);
        },
        onError: (error) => {
          toast.error((error as { message?: string })?.message || "Failed to remove report");
        },
      },
    );
  };

  return (
    <Card>
      <UploadReportDialog slug={slug} open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remove report?"
        description={`Remove "${toDelete?.title}" from this programme? It will no longer be visible.`}
        confirmLabel="Remove"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
        <CardTitle className="flex items-center gap-2">
          Reports
          {reports.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({reports.length})</span>
          )}
        </CardTitle>
        {canUpload && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            Upload report
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {reportsQuery.isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : reportsQuery.isError ? (
          <p className="text-sm text-destructive">Could not load reports.</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reports yet.{canUpload ? " Use Upload report to add one." : ""}
          </p>
        ) : (
          <ul className="divide-y">
            {reports.map((report) => (
              <li key={report.id} className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{report.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {report.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      report.author,
                      formatDate(report.published_at ?? report.created_at),
                      report.file_name
                        ? `${report.file_name}${report.file_size ? ` · ${formatSize(report.file_size)}` : ""}`
                        : "No file attached",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Download ${report.title}`}
                    disabled={!report.file_path || downloading === report.id}
                    onClick={() => handleDownload(report)}
                  >
                    {downloading === report.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label={`Remove ${report.title}`}
                      onClick={() => setToDelete(report)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
