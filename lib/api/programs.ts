import { apiClient, apiUpload } from './client';
import type { ApiResponse, PaginatedResponse } from '../types/common';
import type { AdminDocument } from './documents';

export type ProgrammeType =
  | 'campaign'
  | 'surveillance'
  | 'screening'
  | 'training'
  | 'infrastructure'
  | 'research'
  | 'other';

export type ProgrammeStatus = 'active' | 'completed' | 'suspended' | 'archived';

export type ProgrammeProgressMode =
  | 'lga_coverage'
  | 'outcome_metric'
  | 'combined';

/** A photo in a programme's gallery. URLs are ready to use in <img>. */
export interface ProgrammeImage {
  id: string;
  caption: string | null;
  alt: string | null;
  width: number;
  height: number;
  isCover: boolean;
  sortOrder: number;
  url: string;
  thumbUrl: string;
}

interface ProgrammeImagePayload {
  id: string;
  caption: string | null;
  alt: string | null;
  width: number;
  height: number;
  is_cover: boolean;
  sort_order: number;
  url: string;
  thumb_url: string;
}

const MEDIA_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

function mapImage(raw: ProgrammeImagePayload): ProgrammeImage {
  const abs = (path: string) => (/^https?:\/\//i.test(path) ? path : `${MEDIA_BASE}${path}`);
  return {
    id: raw.id,
    caption: raw.caption,
    alt: raw.alt,
    width: raw.width,
    height: raw.height,
    isCover: raw.is_cover,
    sortOrder: raw.sort_order,
    url: abs(raw.url),
    thumbUrl: abs(raw.thumb_url),
  };
}

export async function getProgrammeImages(slug: string): Promise<ProgrammeImage[]> {
  const response = await apiClient.get<ApiResponse<ProgrammeImagePayload[]>>(
    `/programs/${slug}/images`
  );
  return response.data.data.map(mapImage);
}

export async function uploadProgrammeImage(slug: string, file: File): Promise<ProgrammeImage> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiUpload<ApiResponse<ProgrammeImagePayload>>(
    `/programs/${slug}/images`,
    form
  );
  return mapImage(response.data);
}

export async function updateProgrammeImage(
  slug: string,
  imageId: string,
  data: { caption?: string; alt?: string; isCover?: boolean }
): Promise<ProgrammeImage> {
  const response = await apiClient.patch<ApiResponse<ProgrammeImagePayload>>(
    `/programs/${slug}/images/${imageId}`,
    data
  );
  return mapImage(response.data.data);
}

export async function reorderProgrammeImages(
  slug: string,
  ids: string[]
): Promise<ProgrammeImage[]> {
  const response = await apiClient.put<ApiResponse<ProgrammeImagePayload[]>>(
    `/programs/${slug}/images/order`,
    { ids }
  );
  return response.data.data.map(mapImage);
}

export async function deleteProgrammeImage(slug: string, imageId: string): Promise<void> {
  await apiClient.delete(`/programs/${slug}/images/${imageId}`);
}

export interface AdminProgramme {
  id: string;
  name: string;
  slug: string;
  description: string;
  code: string | null;
  type: ProgrammeType | null;
  status: ProgrammeStatus;
  start_date: string | null;
  end_date: string | null;
  development_partner_id: string | null;
  /** Development partners assigned to run this programme. */
  partners?: Array<{ id: string; name: string; slug: string }>;
  manager_id: string | null;
  target_lgas: string[] | null;
  covered_lgas: string[] | null;
  objectives: string[] | null;
  key_indicators: Record<string, unknown>[] | null;
  dataset_count: number;
  campaign_count: number;
  progress_mode: ProgrammeProgressMode | null;
  primary_metric: string | null;
  target_count: number | null;
  reach_count: number | null;
  lgas_covered_count: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GetProgrammesParams {
  page?: number;
  limit?: number;
  status?: ProgrammeStatus;
  type?: ProgrammeType;
  developmentPartnerId?: string;
  lga?: string;
  q?: string;
  sort?: 'recent' | 'alphabetical';
}

export interface CreateProgrammePayload {
  name: string;
  description: string;
  type?: ProgrammeType;
  code?: string;
  developmentPartnerId?: string;
  /** Partners assigned to run the programme (agency only). */
  partnerIds?: string[];
  managerId?: string;
  targetLgas?: string[];
  coveredLgas?: string[];
  startDate?: string;
  endDate?: string;
  objectives?: string[];
  progressMode?: ProgrammeProgressMode;
  primaryMetric?: string;
  targetCount?: number;
  reachCount?: number;
  lgasCoveredCount?: number;
}

export interface UpdateProgrammePayload extends Partial<CreateProgrammePayload> {
  status?: ProgrammeStatus;
}

interface ProgrammeListApiPayload {
  data: AdminProgramme[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function getProgrammes(
  params?: GetProgrammesParams
): Promise<PaginatedResponse<AdminProgramme>> {
  const response = await apiClient.get<ApiResponse<ProgrammeListApiPayload>>('/programs', {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      status: params?.status,
      type: params?.type,
      developmentPartnerId: params?.developmentPartnerId,
      lga: params?.lga,
      q: params?.q,
      sort: params?.sort,
    },
  });
  const result = response.data.data;
  return {
    data: result.data,
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    totalPages: result.meta.totalPages,
  };
}

export async function getProgrammeBySlug(slug: string): Promise<AdminProgramme> {
  const response = await apiClient.get<ApiResponse<AdminProgramme>>(`/programs/${slug}`);
  return response.data.data;
}

export async function createProgramme(data: CreateProgrammePayload): Promise<AdminProgramme> {
  const response = await apiClient.post<ApiResponse<AdminProgramme>>('/programs', data);
  return response.data.data;
}

export async function updateProgramme(
  slug: string,
  data: UpdateProgrammePayload
): Promise<AdminProgramme> {
  const response = await apiClient.patch<ApiResponse<AdminProgramme>>(`/programs/${slug}`, data);
  return response.data.data;
}

export async function archiveProgramme(slug: string): Promise<void> {
  await apiClient.delete(`/programs/${slug}`);
}

export interface CreateProgrammeReportPayload {
  title: string;
  description: string;
  author?: string;
  tags?: string[];
}

export async function getProgrammeReports(
  slug: string,
  limit = 50,
): Promise<AdminDocument[]> {
  const response = await apiClient.get<ApiResponse<{ data: AdminDocument[] }>>(
    `/programs/${slug}/reports`,
    { params: { page: 1, limit } },
  );
  return response.data.data.data;
}

/** Creates the report record; callers attach the file with uploadFile(). */
export async function createProgrammeReport(
  slug: string,
  data: CreateProgrammeReportPayload,
): Promise<AdminDocument> {
  const response = await apiClient.post<ApiResponse<AdminDocument>>(
    `/programs/${slug}/reports`,
    data,
  );
  return response.data.data;
}

export async function deleteProgrammeReport(
  slug: string,
  reportId: string,
): Promise<void> {
  await apiClient.delete(`/programs/${slug}/reports/${reportId}`);
}
