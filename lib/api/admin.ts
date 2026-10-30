import { apiClient, apiFetchBlobResponse } from './client';
import { API_ROUTES } from './routes';
import type { PaginatedResponse } from '../types/common';
import type { Dataset as BackendDataset, DatasetStatus } from './datasets';
import type { UserRole } from '@/types';

// Use the Dataset type from datasets.ts for the review queue
type Dataset = BackendDataset;

// Backend wraps all responses in this structure
interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  timestamp: string;
  path: string;
  data: T;
}

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: 'pending' | 'active' | 'suspended' | 'archived';
  development_partner_id: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  phone_number?: string | null;
  lga?: string | null;
  ward?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  mfa_enabled?: boolean;
  approved_at?: string | null;
}

export interface UserStats {
  total: number;
  byStatus: Record<string, number>;
  byRole: Record<string, number>;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
  developmentPartnerId?: string;
}

interface UserListResponse {
  data: AdminUser[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UpdateUserRoleDto {
  role: UserRole;
}

export interface UpdateUserStatusDto {
  status: AdminUser['status'];
}

export interface ReviewQueueParams {
  page?: number;
  limit?: number;
  status?: string;
  organisation?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ApproveDatasetDto {
  comment?: string;
}

export interface RejectDatasetDto {
  reason: string;
}

export interface ReviseDatasetDto {
  comment: string;
}

// Mirrors nsgdp-backend AuditAction enum (src/modules/admin/entities/audit-log.entity.ts)
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'download'
  | 'upload'
  | 'export';

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  permission_group_id: string | null;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogParams {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  success?: boolean;
  search?: string;
}

/**
 * Backend's createPaginatedResponse() nests pagination fields under `meta`
 * — not the flat { data, total, page, limit, totalPages } shape the shared
 * `PaginatedResponse<T>` type (lib/types/common.ts) declares. That shared
 * type is wrong for every endpoint that uses it, but nothing else reads
 * its total/totalPages at runtime today; audit logs do, so this uses the
 * shape that actually comes back over the wire.
 */
export interface AuditLogsResponse {
  data: AuditLog[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Get all users with filters and pagination
 */
export async function getUsers(
  params?: UserListParams
): Promise<PaginatedResponse<AdminUser>> {
  const response = await apiClient.get<ApiResponse<UserListResponse>>(
    '/admin/users',
    { params: params as Record<string, unknown> }
  );
  const result = response.data.data;
  return {
    data: result.data,
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    totalPages: result.meta.totalPages,
  };
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<UserStats> {
  const response = await apiClient.get<ApiResponse<UserStats>>(
    '/admin/users/stats'
  );
  return response.data.data;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<AdminUser> {
  const response = await apiClient.get<ApiResponse<AdminUser>>(
    `/admin/users/${userId}`
  );
  return response.data.data;
}

/**
 * Update user role (super_admin only)
 */
export async function updateUserRole(
  userId: string,
  data: UpdateUserRoleDto
): Promise<AdminUser> {
  const response = await apiClient.patch<ApiResponse<AdminUser>>(
    `/admin/users/${userId}/role`,
    data
  );
  return response.data.data;
}

/**
 * Update user status (activate, suspend, archive) — super_admin/admin only,
 * no delegated-permission path. Use deactivateUserDelegated for the
 * staff-reachable suspend action.
 */
export async function updateUserStatus(
  userId: string,
  data: UpdateUserStatusDto
): Promise<AdminUser> {
  const response = await apiClient.patch<ApiResponse<AdminUser>>(
    `/admin/users/${userId}/status`,
    data
  );
  return response.data.data;
}

/**
 * Promote a user to admin of their own development partner — the only role
 * change exposed anywhere in the UI. Reachable by super_admin or staff/admin
 * holding the promote:org-admin permission. Server-side only allows
 * promoting within the user's existing development partner, never cross-org
 * and never to super_admin.
 */
export async function promoteToOrgAdmin(userId: string): Promise<AdminUser> {
  const response = await apiClient.post<ApiResponse<{ user: AdminUser }>>(
    `/admin/users/${userId}/promote-org-admin`,
    {}
  );
  return response.data.data.user;
}

/**
 * Demote an org admin back to contributor — counterpart to promoteToOrgAdmin.
 * Reachable by super_admin or staff/admin holding demote:org-admin. Server-side
 * blocks demoting the last remaining admin of a development partner.
 */
export async function demoteFromOrgAdmin(userId: string): Promise<AdminUser> {
  const response = await apiClient.post<ApiResponse<{ user: AdminUser }>>(
    `/admin/users/${userId}/demote-org-admin`,
    {}
  );
  return response.data.data.user;
}

/**
 * Remove a member from a development partner — detaches them
 * (development_partner_id -> null) without touching the account itself.
 * Reachable by that partner's own admin, super_admin, or staff holding
 * remove:org-members.
 */
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  await apiClient.patch<ApiResponse<{ message: string }>>(
    `/development-partners/${orgId}/members/${userId}/remove`,
    {}
  );
}

/**
 * Suspend a user account — super_admin only, not delegatable.
 */
export async function deactivateUserDelegated(
  userId: string,
  reason?: string
): Promise<void> {
  await apiClient.post<ApiResponse<{ message: string }>>(
    `/admin/users/${userId}/deactivate`,
    reason ? { reason } : {}
  );
}

/**
 * Soft delete a user account (admin only)
 */
export async function removeUser(userId: string): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`);
}

/**
 * Get dataset review queue
 */
export async function getReviewQueue(
  params?: ReviewQueueParams
): Promise<{ data: Dataset[]; total: number; page: number; limit: number }> {
  const response = await apiClient.get<ApiResponse<{ data: Dataset[]; total: number; page: number; limit: number }>>(
    '/admin/review-queue',
    { params: params as Record<string, unknown> }
  );
  return response.data.data;
}

/**
 * Approve a dataset
 */
export async function approveDataset(
  datasetId: string,
  data?: ApproveDatasetDto
): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetId}/approve`,
    data || {}
  );
  return response.data.data;
}

/**
 * Reject a dataset
 */
export async function rejectDataset(
  datasetId: string,
  data: RejectDatasetDto
): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetId}/reject`,
    data
  );
  return response.data.data;
}

/**
 * Request dataset revision
 */
export async function requestRevision(
  datasetSlug: string,
  data: ReviseDatasetDto
): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetSlug}/request-revision`,
    data
  );
  return response.data.data;
}

/**
 * Publish an approved dataset to the public catalogue
 */
export async function publishDataset(datasetSlug: string): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetSlug}/publish`,
    {}
  );
  return response.data.data;
}

/**
 * Change catalogue access level (public / restricted / private).
 */
export async function updateDatasetVisibility(
  datasetSlug: string,
  visibility: 'public' | 'restricted' | 'private',
): Promise<Dataset> {
  const response = await apiClient.patch<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetSlug}/visibility`,
    { visibility },
  );
  return response.data.data;
}

/**
 * Load resolved staging into disease_burden (analytics warehouse).
 * Separate from catalogue publish.
 */
export async function publishDatasetAnalytics(
  datasetSlug: string
): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetSlug}/publish-analytics`,
    {}
  );
  return response.data.data;
}

/**
 * Unpublish a dataset from the public catalogue (stays approved)
 */
export async function unpublishDataset(datasetSlug: string): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/admin/datasets/${datasetSlug}/unpublish`,
    {}
  );
  return response.data.data;
}

export interface RetractDatasetPayload {
  reason: string;
  mfaCode?: string;
  forgetAliases?: boolean;
  purgeStaging?: boolean;
}

/**
 * Retract a published dataset's ingestion batch (MFA-gated, super_admin or
 * publish:datasets). Note: unlike every other dataset action in this file,
 * the backend route takes the dataset UUID, not the slug.
 */
export async function retractDataset(datasetId: string, payload: RetractDatasetPayload): Promise<void> {
  await apiClient.post(`/admin/datasets/${datasetId}/retract`, payload);
}

/**
 * Get audit logs
 */
export async function getAuditLogs(
  params?: AuditLogParams
): Promise<AuditLogsResponse> {
  const response = await apiClient.get<ApiResponse<AuditLogsResponse>>(
    '/admin/audit-logs',
    { params: params as Record<string, unknown> }
  );
  return response.data.data;
}

/**
 * Export audit logs as CSV
 */
export async function exportAuditLogs(
  params?: Omit<AuditLogParams, 'page' | 'limit'>
): Promise<Blob> {
  const response = await apiClient.getBlob('/admin/audit-logs/export', {
    params: params as Record<string, unknown>,
  });
  return response.data;
}

/**
 * Dashboard statistics
 */
interface DashboardStatsResponse {
  datasets: {
    total: number;
    pending: number;
    byStatus: Record<string, number>;
    byDevelopmentPartner: Array<{ orgId: string; orgName: string; count: number }>;
  };
  users: {
    total: number;
  };
  developmentPartners: number;
  downloads: {
    total: number;
    thisMonth: number;
    thisWeek: number;
    topDatasets: Array<{ datasetId: string; title: string; count: number }>;
  };
  uploads: {
    thisMonth: number;
    thisWeek: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    description?: string;
    userName: string;
    datasetTitle?: string;
    timestamp: string;
  }>;
}

/**
 * Soft delete a dataset (admin only) - can be restored
 */
export async function deleteDataset(datasetSlug: string): Promise<void> {
  await apiClient.delete(`/admin/datasets/${datasetSlug}`);
}

export const PERMANENT_DELETE_CONFIRM_PHRASE = "PERMANENTLY DELETE";

export interface CleanupDatasetRow {
  id: string;
  title: string;
  slug: string;
  status: DatasetStatus;
  format: string;
  developmentPartnerId: string;
  organisationName: string | null;
  deletedAt: string | null;
  publishedAt: string | null;
  analyticsPublishedAt: string | null;
  ingestionStatus: string;
  gisSlot: string | null;
  fileSize: number | null;
}

export interface CleanupDatasetPage {
  data: CleanupDatasetRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface PermanentlyDeletedDataset {
  id: string;
  slug: string;
  title: string;
  storageObjectsRemoved: number;
}

export interface BulkPermanentlyDeleteResult {
  succeeded: PermanentlyDeletedDataset[];
  failed: Array<{ slug: string; error: string }>;
}

export async function listCleanupDatasets(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<CleanupDatasetPage> {
  const response = await apiClient.get<ApiResponse<CleanupDatasetPage>>(
    API_ROUTES.admin.cleanup.datasets,
    {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        search: params.search || undefined,
      },
    },
  );
  return response.data.data;
}

export async function permanentlyDeleteDataset(
  slug: string,
  confirmSlug: string,
): Promise<PermanentlyDeletedDataset> {
  const response = await apiClient.delete<ApiResponse<PermanentlyDeletedDataset>>(
    API_ROUTES.admin.cleanup.permanentlyDelete(slug),
    { body: { confirmSlug } },
  );
  return response.data.data;
}

export async function bulkPermanentlyDeleteDatasets(
  slugs: string[],
  confirmPhrase: string,
): Promise<BulkPermanentlyDeleteResult> {
  const response = await apiClient.post<ApiResponse<BulkPermanentlyDeleteResult>>(
    API_ROUTES.admin.cleanup.bulkDelete,
    { slugs, confirmPhrase },
  );
  return response.data.data;
}

export interface ArchiveDatasetPayload {
  reason?: string;
  retractFromAnalytics?: boolean;
  retractReason?: string;
  mfaCode?: string;
}

export interface BulkArchiveDatasetsPayload extends ArchiveDatasetPayload {
  slugs: string[];
}

export interface BulkArchiveDatasetsResult {
  succeeded: Array<{ slug: string; id: string; title: string }>;
  failed: Array<{ slug: string; error: string; needsRetract?: boolean }>;
  analyticsRetractCount: number;
}

/**
 * Archive a dataset (changes status to ARCHIVED)
 */
export async function archiveDataset(
  datasetSlug: string,
  payload?: ArchiveDatasetPayload,
): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/datasets/${datasetSlug}/archive`,
    payload,
  );
  return response.data.data;
}

/**
 * Archive multiple datasets (admin review queue bulk action)
 */
export async function bulkArchiveDatasets(
  payload: BulkArchiveDatasetsPayload,
): Promise<BulkArchiveDatasetsResult> {
  const response = await apiClient.post<ApiResponse<BulkArchiveDatasetsResult>>(
    '/admin/datasets/bulk-archive',
    payload,
  );
  return response.data.data;
}

/** Max datasets per bulk ZIP (must match BULK_DOWNLOAD_MAX_DATASETS in the backend). */
export const BULK_DOWNLOAD_MAX_DATASETS = 25;

export interface BulkDownloadSkipped {
  slug: string;
  reason: string;
}

export interface BulkDownloadResult {
  blob: Blob;
  fileName: string;
  includedCount: number;
  skipped: BulkDownloadSkipped[];
}

function parseSkippedHeader(value: string | null): BulkDownloadSkipped[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    return Array.isArray(parsed) ? (parsed as BulkDownloadSkipped[]) : [];
  } catch {
    // Header is capped server-side; a truncated value is not valid JSON.
    return [];
  }
}

/**
 * Download several datasets as one ZIP. The server decides per dataset what
 * the caller may download (restricted datasets need access or the
 * download:restricted permission; unpublished ones need a review
 * permission) and reports the rest as skipped.
 */
export async function bulkDownloadDatasets(
  slugs: string[],
): Promise<BulkDownloadResult> {
  const { blob, headers } = await apiFetchBlobResponse('/datasets/bulk-download', {
    method: 'POST',
    body: { slugs },
  });
  const disposition = headers.get('Content-Disposition') ?? '';
  const included = Number(headers.get('X-Bulk-Included') ?? '0');
  const skipped = parseSkippedHeader(headers.get('X-Bulk-Skipped-Details'));
  const skippedCount = Number(headers.get('X-Bulk-Skipped') ?? '0');
  return {
    blob,
    fileName:
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'nsgdp-datasets.zip',
    includedCount: Number.isFinite(included) ? included : 0,
    // Details header can be truncated; fall back to the plain count.
    skipped:
      skipped.length > 0 || !skippedCount
        ? skipped
        : Array.from({ length: skippedCount }, () => ({
            slug: '',
            reason: 'Not available for download',
          })),
  };
}

/**
 * Restore an archived dataset to its previous workflow status
 */
export async function unarchiveDataset(datasetSlug: string): Promise<Dataset> {
  const response = await apiClient.post<ApiResponse<Dataset>>(
    `/datasets/${datasetSlug}/unarchive`
  );
  return response.data.data;
}

export interface DashboardStats {
  totalUsers: number;
  totalDevelopmentPartners: number;
  totalDatasets: number;
  pendingDatasets: number;
  totalDownloads: number;
  datasetStats: {
    byStatus: Record<string, number>;
    byDevelopmentPartner: Array<{ developmentPartnerId: string; organisationName: string; count: number }>;
  };
  downloadStats: {
    total: number;
    thisMonth: number;
    thisWeek: number;
    topDatasets: Array<{ datasetId: string; datasetTitle: string; downloads: number }>;
  };
  uploadStats: {
    total: number;
    thisMonth: number;
    thisWeek: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    userName: string;
    entityType: string;
    timestamp: string;
    description?: string;
    datasetTitle?: string;
  }>;
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await apiClient.get<ApiResponse<DashboardStatsResponse>>(
    '/admin/dashboard/stats'
  );
  const stats = response.data.data;

  return {
    totalUsers: stats.users.total,
    totalDevelopmentPartners: stats.developmentPartners,
    totalDatasets: stats.datasets.total,
    pendingDatasets: stats.datasets.pending,
    totalDownloads: stats.downloads.total,
    datasetStats: {
      byStatus: stats.datasets.byStatus,
      byDevelopmentPartner: stats.datasets.byDevelopmentPartner.map((developmentPartner) => ({
        developmentPartnerId: developmentPartner.orgId,
        organisationName: developmentPartner.orgName,
        count: developmentPartner.count,
      })),
    },
    downloadStats: {
      total: stats.downloads.total,
      thisMonth: stats.downloads.thisMonth,
      thisWeek: stats.downloads.thisWeek,
      topDatasets: stats.downloads.topDatasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        datasetTitle: dataset.title,
        downloads: dataset.count,
      })),
    },
    uploadStats: {
      total: stats.datasets.total,
      thisMonth: stats.uploads.thisMonth,
      thisWeek: stats.uploads.thisWeek,
    },
    recentActivity: stats.recentActivity.map((activity) => ({
      id: activity.id,
      action: activity.action,
      userName: activity.userName,
      entityType: activity.entityType,
      description: activity.description,
      datasetTitle: activity.datasetTitle,
      timestamp: activity.timestamp,
    })),
  };
}

export interface ActivityDataPoint {
  date: string;
  views: number;
  downloads: number;
}

/**
 * Get real daily views/downloads series for the platform activity graph
 */
export async function getDashboardActivity(): Promise<{
  data7d: ActivityDataPoint[];
  data30d: ActivityDataPoint[];
}> {
  const response = await apiClient.get<ApiResponse<{ data7d: ActivityDataPoint[]; data30d: ActivityDataPoint[] }>>(
    '/admin/dashboard/activity'
  );
  return response.data.data;
}

export interface AnalyticsTimeSeries {
  uploadsOverTime: Array<{ month: string; uploads: number }>;
  newUsersOverTime: Array<{ month: string; users: number }>;
  headline: {
    totalUsers: number;
    totalDatasets: number;
    totalDownloads: number;
    downloadsThisMonth: number;
    pendingReview: number;
  };
  popularDatasets: Array<{
    datasetId: string;
    title: string;
    downloads: number;
  }>;
}

export interface DatasetPipelineStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byStatus: Record<string, number>;
  byCategory: Array<{
    categoryId: string | null;
    categoryName: string;
    count: number;
  }>;
  byDevelopmentPartner: Array<{ orgId: string; orgName: string; count: number }>;
  staleness: {
    publishedTotal: number;
    overdue: number;
    dueSoon: number;
    noSchedule: number;
  };
}

export interface GovernanceAnalytics {
  aliasResolution: {
    pendingIndicatorAliases: number;
    pendingOrgunitAliases: number;
    confirmedIndicatorAliases: number;
    autoResolutionRate: number;
  };
  burdenQuality: Array<{
    indicatorSlug: string;
    indicatorName: string;
    missingPct: number;
    totalRows: number;
  }>;
  openConflicts: number;
  datasetsWithOpenConflicts: number;
  stagingTotal: number;
  indicatorPendingStaging: number;
}

export interface DatasetCompareResult {
  datasetA: string;
  datasetB: string;
  mode: 'live' | 'raw';
  keysA: number;
  keysB: number;
  sharedKeys: number;
  coverageOverlap: number;
  conflicts: number;
  completenessA: number | null;
  completenessB: number | null;
  relationStatus?: string | null;
}

export type DatasetCompareMode = 'live' | 'raw';

/**
 * Get real month-bucketed uploads/new-users series for the Analytics page
 */
export async function getAdminAnalytics(
  months = 6
): Promise<AnalyticsTimeSeries> {
  const response = await apiClient.get<ApiResponse<AnalyticsTimeSeries>>(
    '/admin/analytics',
    { params: { months } }
  );
  return response.data.data;
}

export async function getDatasetPipelineStats(): Promise<DatasetPipelineStats> {
  const response = await apiClient.get<ApiResponse<DatasetPipelineStats>>(
    '/admin/datasets/stats'
  );
  return response.data.data;
}

export async function getGovernanceAnalytics(): Promise<GovernanceAnalytics> {
  const response = await apiClient.get<ApiResponse<GovernanceAnalytics>>(
    '/admin/analytics/governance'
  );
  return response.data.data;
}

export async function compareDatasets(
  datasetA: string,
  datasetB: string,
  mode: DatasetCompareMode = 'live',
): Promise<DatasetCompareResult> {
  const response = await apiClient.get<ApiResponse<DatasetCompareResult>>(
    '/admin/analytics/compare',
    { params: { dataset_a: datasetA, dataset_b: datasetB, mode } }
  );
  return response.data.data;
}

export type DatasetSimilarityVerdict =
  | 'likely_duplicate'
  | 'overlapping'
  | 'different';

export interface DatasetCompareProfile {
  id: string;
  title: string;
  slug: string;
  status: string;
  ingestionStatus: string;
  format: string;
  version: number;
  partner: string | null;
  responsibleDept: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  tags: string[];
  indicators: string[];
  geography: string[];
  /** Null when the dataset owns no rows in the warehouse (never ingested). */
  content: {
    rows: number;
    indicators: number;
    lgas: number;
    yearMin: number | null;
    yearMax: number | null;
    completeness: number | null;
  } | null;
}

export interface DatasetCompareProfileResult {
  datasetA: DatasetCompareProfile;
  datasetB: DatasetCompareProfile;
  shared: {
    indicators: number;
    lgas: number;
    years: number;
    keys: number;
    conflicts: number;
    coverageOverlap: number;
  } | null;
  relationStatus: string | null;
  similarity: {
    score: number;
    verdict: DatasetSimilarityVerdict;
    components: Array<{
      key: string;
      label: string;
      score: number | null;
      weight: number;
    }>;
  };
}

export async function getDatasetCompareProfile(
  datasetA: string,
  datasetB: string,
): Promise<DatasetCompareProfileResult> {
  const response = await apiClient.get<
    ApiResponse<DatasetCompareProfileResult>
  >('/admin/analytics/compare/profile', {
    params: { dataset_a: datasetA, dataset_b: datasetB },
  });
  return response.data.data;
}

export async function refreshAnalyticsCache(): Promise<void> {
  await apiClient.post('/analytics/refresh');
}

/**
 * Export month-bucketed analytics as CSV
 */
export async function exportAnalytics(months = 6): Promise<Blob> {
  const response = await apiClient.getBlob('/admin/analytics/export', {
    params: { months },
  });
  return response.data;
}

/**
 * Export a generic admin API client for custom requests
 */
export const adminApi = apiClient;
