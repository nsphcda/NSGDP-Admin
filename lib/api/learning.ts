import { apiClient, apiUpload } from "./client";

export const LEARNING_KINDS = [
  "guide",
  "path",
  "video",
  "faq",
  "glossary",
  "template",
  "update",
] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

export type LearningStatus = "draft" | "published";
export type LearningAudience = "contributor" | "partner_admin" | "viewer";
export type GuideCategory = "getting-started" | "contribute" | "manage" | "explore" | "gis";

export const LEARNING_AUDIENCES: Array<{ id: LearningAudience; label: string }> = [
  { id: "viewer", label: "Public" },
  { id: "contributor", label: "Contributor" },
  { id: "partner_admin", label: "Partner admin" },
];

export const GUIDE_CATEGORIES: Array<{ id: GuideCategory; label: string }> = [
  { id: "getting-started", label: "Getting started" },
  { id: "contribute", label: "Contribute data" },
  { id: "manage", label: "Manage your organisation" },
  { id: "explore", label: "Explore data" },
  { id: "gis", label: "Maps & GIS" },
];

/** Keep in sync with LearningIconKey in the portal and the backend schema. */
export const LEARNING_ICONS = [
  "book", "rocket", "layout", "file-check", "upload", "tags", "eye", "workflow",
  "refresh", "archive", "users", "key", "target", "file-text", "search",
  "bar-chart", "map", "sparkles", "layers", "database", "shield", "mail", "graduation",
] as const;
export type LearningIcon = (typeof LEARNING_ICONS)[number];

export interface LearningItem<D = Record<string, unknown>> {
  id: string;
  kind: LearningKind;
  slug: string;
  title: string;
  status: LearningStatus;
  sort_order: number;
  data: D;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuideStepData {
  title: string;
  body: string;
  tip?: string;
  image?: { assetId: string; alt?: string; caption?: string };
  screenshot?: string;
  link?: { label: string; href: string };
}

export interface GuideData {
  summary: string;
  category: GuideCategory;
  audience: LearningAudience[];
  minutes: number;
  level: "Beginner" | "Intermediate" | "Advanced";
  icon: LearningIcon;
  featured: boolean;
  updated: string;
  outcomes: string[];
  steps: GuideStepData[];
  callouts?: Array<{ tone: "tip" | "warning" | "info"; title: string; body: string }>;
  cta?: { label: string; href: string };
  related: string[];
}

export interface LearningAsset {
  id: string;
  kind: "image" | "video" | "file";
  file_name: string;
  mime_type: string;
  size: number;
  status: "pending" | "ready";
  alt: string | null;
  created_at: string;
  /** API path; resolve with assetUrl(). */
  url: string;
  used_by?: Array<{ kind: LearningKind; id: string; title: string }>;
}

interface Envelope<T> {
  data: T;
}

const BASE = "/admin/learning";

export async function listLearning<D = Record<string, unknown>>(kind: LearningKind) {
  const res = await apiClient.get<Envelope<Array<LearningItem<D>>>>(`${BASE}/${kind}`);
  return res.data.data;
}

export async function getLearning<D = Record<string, unknown>>(kind: LearningKind, id: string) {
  const res = await apiClient.get<Envelope<LearningItem<D>>>(`${BASE}/${kind}/${id}`);
  return res.data.data;
}

export async function createLearning<D>(
  kind: LearningKind,
  payload: { title: string; slug?: string; data: D },
) {
  const res = await apiClient.post<Envelope<LearningItem<D>>>(`${BASE}/${kind}`, payload);
  return res.data.data;
}

export async function updateLearning<D>(
  kind: LearningKind,
  id: string,
  payload: { title?: string; slug?: string; data?: D },
) {
  const res = await apiClient.patch<Envelope<LearningItem<D>>>(`${BASE}/${kind}/${id}`, payload);
  return res.data.data;
}

export async function setLearningStatus(kind: LearningKind, id: string, status: LearningStatus) {
  const res = await apiClient.post<Envelope<LearningItem>>(
    `${BASE}/${kind}/${id}/${status === "published" ? "publish" : "unpublish"}`,
  );
  return res.data.data;
}

export async function deleteLearning(kind: LearningKind, id: string) {
  await apiClient.delete(`${BASE}/${kind}/${id}`);
}

export async function reorderLearning(kind: LearningKind, ids: string[]) {
  await apiClient.post(`${BASE}/${kind}/reorder`, { ids });
}

export async function seedLearningDefaults() {
  const res = await apiClient.post<Envelope<{ inserted: number; skipped: number; failed: string[] }>>(
    `${BASE}/seed`,
  );
  return res.data.data;
}

// ── Media library ──────────────────────────────────────────────────────────

export async function listLearningAssets(kind?: LearningAsset["kind"]) {
  const res = await apiClient.get<Envelope<LearningAsset[]>>(`${BASE}/assets`, {
    params: { kind },
  });
  return res.data.data;
}

export async function uploadLearningImage(
  file: File,
  alt: string | undefined,
  onProgress?: (percent: number) => void,
) {
  const form = new FormData();
  form.append("file", file);
  if (alt) form.append("alt", alt);
  const res = await apiUpload<Envelope<LearningAsset>>(`${BASE}/assets/image`, form, {
    onUploadProgress: onProgress,
  });
  return res.data;
}

export async function uploadLearningFile(file: File, onProgress?: (percent: number) => void) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiUpload<Envelope<LearningAsset>>(`${BASE}/assets/file`, form, {
    onUploadProgress: onProgress,
  });
  return res.data;
}

/**
 * Videos go straight from the browser to storage with a presigned PUT, so the
 * API never buffers them. init -> PUT (with progress) -> complete.
 */
export async function uploadLearningVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<LearningAsset> {
  const init = await apiClient.post<
    Envelope<{ assetId: string; uploadUrl: string; headers: Record<string, string> }>
  >(`${BASE}/assets/video/init`, {
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const { assetId, uploadUrl, headers } = init.data.data;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status})`));
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload failed. If this keeps happening, storage CORS may not allow this admin origin.",
        ),
      );
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });

  const done = await apiClient.post<Envelope<LearningAsset>>(`${BASE}/assets/${assetId}/complete`);
  return done.data.data;
}

export async function deleteLearningAsset(id: string) {
  await apiClient.delete(`${BASE}/assets/${id}`);
}

/** Absolute URL for an API media path (the admin shares the portal API origin). */
export function assetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  return `${base}${path}`;
}

/** Real length of a local video file in seconds (reads the file's metadata, no upload). */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** 125 -> "2:05", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * A JPEG still from a local video, taken in the browser (same-origin blob, so the
 * canvas is not tainted). Used as the video's poster so thumbnails load instantly
 * instead of making the browser seek inside a large file.
 */
export function captureVideoFrame(file: File, atSeconds = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    const done = (blob: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, video.duration / 2));
    };
    video.onseeked = () => {
      const width = Math.min(960, video.videoWidth || 960);
      const height = Math.round(((video.videoHeight || 540) / (video.videoWidth || 960)) * width);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => done(blob), "image/jpeg", 0.82);
    };
    video.src = url;
  });
}
