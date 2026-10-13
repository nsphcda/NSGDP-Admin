import { apiClient, ApiError } from './client';

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  timestamp: string;
  path: string;
  data: T;
}

export interface ReviewQueueCandidate {
  indicatorId: string;
  name: string;
  score: number;
  method: string;
}

export interface ReviewQueueSampleObservation {
  rawOrgunit: string | null;
  rawPeriod: string | null;
  value: number | null;
  cellRef: string;
}

export interface ReviewQueueItem {
  id: string;
  // Org-unit items appear in this same queue but have no confirm/reject
  // action here — org-unit resolution reuses GisReferenceService, so those
  // are resolved from the existing GIS Reference Layers page instead.
  kind: 'indicator' | 'orgunit';
  rawText: string;
  normalized: string;
  sheetName?: string;
  cellRef?: string;
  datasetId?: string;
  datasetTitle?: string;
  datasetSlug?: string;
  candidates: ReviewQueueCandidate[] | unknown[] | null;
  method: string;
  confidence: string | null;
  indicatorId: string | null;
  status?: string;
  affectedRows?: number;
  siblingLabels?: string[];
  programmeHint?: string | null;
  suggestedRegistryName?: string | null;
  sample?: ReviewQueueSampleObservation | null;
}

export type ReviewQueueMode = 'pending' | 'auto';


import type { IngestionFitness } from '@/lib/utils/ingestion-fitness';

export interface IngestionReport {
  datasetId: string;
  ingestionStatus: string;
  report: Record<string, unknown> | null;
  fitness: IngestionFitness | null;
  stagingTotal: number;
  resolved: number;
  byHoldReason: Record<string, number>;
  flagged: number;
}

export interface CoverageRegisterRow {
  id: string;
  dataset_id: string;
  sheet_name: string;
  species: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'UNKNOWN';
  handler: string | null;
  columns_seen: number | null;
  rows_emitted: number;
  distinct_indicators: number | null;
  resolution_rate: string | null;
  processed_at: string;
}

export interface DatasetRelation {
  id: string;
  dataset_a_id: string;
  dataset_b_id: string;
  overlap_ratio: string;
  shared_keys: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'inactive';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type RelationStatus = 'pending' | 'confirmed' | 'rejected' | 'inactive';

export interface RelationView {
  id: string;
  datasetAId: string;
  datasetATitle: string;
  datasetASlug: string;
  datasetBId: string;
  datasetBTitle: string;
  datasetBSlug: string;
  overlapRatio: string;
  sharedKeys: number;
  status: RelationStatus;
  createdAt: string;
}

export async function getReviewQueue(
  datasetId?: string,
  limit?: number,
  mode: ReviewQueueMode = 'pending',
): Promise<ReviewQueueItem[]> {
  const response = await apiClient.get<ApiResponse<ReviewQueueItem[]>>(
    '/admin/governance/ingestion/review-queue',
    { params: { datasetId, limit, mode } }
  );
  return response.data.data;
}

export async function confirmIndicatorAlias(aliasId: string, indicatorId: string): Promise<{ promoted: number }> {
  const response = await apiClient.post<ApiResponse<{ promoted: number }>>(
    `/admin/governance/ingestion/aliases/${aliasId}/confirm`,
    { indicatorId }
  );
  return response.data.data;
}

export async function confirmOrgunitAlias(
  aliasId: string,
  orgunitId: string,
): Promise<{ promoted: number }> {
  const response = await apiClient.post<ApiResponse<{ promoted: number }>>(
    `/admin/governance/ingestion/orgunit-aliases/${aliasId}/confirm`,
    { orgunitId },
  );
  return response.data.data;
}

export async function rejectIndicatorAlias(
  aliasId: string,
): Promise<{ excluded: number }> {
  const response = await apiClient.post<ApiResponse<{ excluded: number }>>(
    `/admin/governance/ingestion/aliases/${aliasId}/reject`,
    {},
  );
  return response.data.data;
}

export async function acceptAutoMatchedAliases(
  aliasIds: string[],
): Promise<{ accepted: number; skipped: number }> {
  const response = await apiClient.post<
    ApiResponse<{ accepted: number; skipped: number }>
  >('/admin/governance/ingestion/aliases/auto/accept', { aliasIds });
  return response.data.data;
}

export async function rejectIndicatorAliases(
  aliasIds: string[],
): Promise<{ rejected: number; excluded: number; skipped: number }> {
  const response = await apiClient.post<
    ApiResponse<{ rejected: number; excluded: number; skipped: number }>
  >('/admin/governance/ingestion/aliases/reject', { aliasIds });
  return response.data.data;
}

export async function getIngestionReport(datasetId: string): Promise<IngestionReport> {
  const response = await apiClient.get<ApiResponse<IngestionReport>>(
    `/admin/governance/ingestion/datasets/${datasetId}/report`
  );
  return response.data.data;
}

export type AnalyticsPipelineStepState =
  | 'done'
  | 'active'
  | 'pending'
  | 'blocked';

export type AnalyticsPublishPhase =
  | 'not_applicable'
  | 'blocked'
  | 'ready'
  | 'loading'
  | 'loaded'
  | 'updating'
  | 'retracting'
  | 'failed';

export type AnalyticsQueueState = 'none' | 'active' | 'waiting' | 'delayed';

export interface AnalyticsPublishStatus {
  phase: AnalyticsPublishPhase;
  blockReason: string | null;
  unpublishedRows: number;
  pendingAliases: number;
  openConflicts: number;
  cataloguePublished: boolean;
  analyticsPublishedAt: string | null;
  lastError: string | null;
  publishingSince: string | null;
  workerHint: string | null;
  queueState?: AnalyticsQueueState;
  queueAttemptsMade?: number;
  queueMaxAttempts?: number;
  ingestionInProgress: boolean;
  steps: {
    ingested: AnalyticsPipelineStepState;
    aliasesClear: AnalyticsPipelineStepState;
    catalogueLive: AnalyticsPipelineStepState;
    analyticsLoaded: AnalyticsPipelineStepState;
  };
}

export async function getAnalyticsPublishStatus(
  datasetId: string,
): Promise<AnalyticsPublishStatus> {
  const response = await apiClient.get<ApiResponse<AnalyticsPublishStatus>>(
    `/admin/governance/ingestion/datasets/${datasetId}/analytics-publish-status`,
  );
  return response.data.data;
}

export type AnalyticsWarehouseFilter =
  | 'in_warehouse'
  | 'ready'
  | 'loading'
  | 'all';

export interface AnalyticsWarehouseSourceRow {
  datasetId: string;
  slug: string;
  title: string;
  format: string;
  status: string;
  ingestionStatus: string;
  cataloguePublishedAt: string | null;
  analyticsPublishedAt: string | null;
  developmentPartnerId: string | null;
  organisationName: string | null;
  organisationAcronym: string | null;
  burdenRowCount: number;
  indicatorCount: number;
  phase: AnalyticsPublishPhase;
  lastError: string | null;
  publishingSince: string | null;
  publicationStatus: string | null;
  canRetract: boolean;
  canLoad: boolean;
  pendingAliases: number;
  publishableRows: number;
  openConflicts: number;
  blockReason: string | null;
}

export interface AnalyticsWarehouseSummary {
  inWarehouse: number;
  readyToLoad: number;
  loading: number;
  failed: number;
}

export interface AnalyticsWarehouseListResult {
  items: AnalyticsWarehouseSourceRow[];
  total: number;
  summary: AnalyticsWarehouseSummary;
}

export async function listAnalyticsWarehouse(params?: {
  filter?: AnalyticsWarehouseFilter;
  developmentPartnerId?: string;
  limit?: number;
  offset?: number;
}): Promise<AnalyticsWarehouseListResult> {
  const response = await apiClient.get<ApiResponse<AnalyticsWarehouseListResult>>(
    '/admin/governance/ingestion/analytics-warehouse',
    { params },
  );
  return response.data.data;
}

export async function getCoverageRegister(datasetId: string): Promise<CoverageRegisterRow[]> {
  const response = await apiClient.get<ApiResponse<CoverageRegisterRow[]>>(
    `/admin/governance/ingestion/datasets/${datasetId}/coverage`
  );
  return response.data.data;
}

export async function narrateIngestion(datasetId: string): Promise<{ summary: string }> {
  const response = await apiClient.post<ApiResponse<{ summary: string }>>(
    `/admin/governance/ingestion/datasets/${datasetId}/narrate`,
    {}
  );
  return response.data.data;
}

export interface IngestionEnsureResult {
  datasetId: string;
  slug: string;
  action: "enqueued" | "already_queued" | "skipped";
  reason?: string;
  ingestionJobId?: string;
}

export interface IngestionCancelResult {
  cancelled: boolean;
  jobId?: string;
  reason?: string;
}

export interface IngestionBackfillResult {
  scanned: number;
  enqueued: number;
  alreadyQueued: number;
  skipped: number;
  results: IngestionEnsureResult[];
}

export type IngestionJobStatus =
  | "pending"
  | "validating"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type IngestionStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export interface IngestionStep {
  key: string;
  label: string;
  status: IngestionStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  itemsTotal: number | null;
  itemsDone: number;
  message: string | null;
}

export interface IngestionProgress {
  jobId: string;
  datasetId: string | null;
  status: IngestionJobStatus;
  progress: number;
  currentStage: string | null;
  steps: IngestionStep[];
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Present only while the run is waiting in the queue. */
  queue?: { ahead: number; etaSeconds: number | null } | null;
}

export interface InFlightIngestionJob extends IngestionProgress {
  datasetTitle: string | null;
  datasetSlug: string | null;
}

/** Catch-up / manual retry for a single dataset. */
export async function runDatasetIngestion(
  datasetId: string,
  opts: { force?: boolean } = {}
): Promise<IngestionEnsureResult> {
  const qs = opts.force ? "?force=true" : "";
  const response = await apiClient.post<ApiResponse<IngestionEnsureResult>>(
    `/admin/governance/ingestion/datasets/${datasetId}/run${qs}`,
    {}
  );
  return response.data.data;
}

/** Stop in-flight ingestion or clear stuck processing state after a worker restart. */
export async function cancelDatasetIngestion(
  datasetId: string,
): Promise<IngestionCancelResult> {
  const response = await apiClient.post<ApiResponse<IngestionCancelResult>>(
    `/admin/governance/ingestion/datasets/${datasetId}/cancel`,
    {},
  );
  return response.data.data;
}

/** One-shot catch-up across eligible review-path datasets. */
export async function backfillIngestion(limit = 50): Promise<IngestionBackfillResult> {
  const response = await apiClient.post<ApiResponse<IngestionBackfillResult>>(
    `/admin/governance/ingestion/backfill?limit=${limit}`,
    {}
  );
  return response.data.data;
}

/** Latest ingestion job progress for a dataset (404 → null). */
export async function getIngestionProgress(
  datasetId: string
): Promise<IngestionProgress | null> {
  try {
    const response = await apiClient.get<ApiResponse<IngestionProgress>>(
      `/datasets/${datasetId}/ingestion`
    );
    return response.data.data;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Queued + running jobs for the ops board. */
export async function listInFlightIngestionJobs(
  limit = 50
): Promise<InFlightIngestionJob[]> {
  const response = await apiClient.get<ApiResponse<InFlightIngestionJob[]>>(
    "/admin/governance/ingestion/jobs/in-flight",
    { params: { limit } }
  );
  return response.data.data;
}

export type PipelineAttentionFilter = 'failed' | 'incomplete' | 'all';

export type PipelineAttentionKind =
  | 'failed'
  | 'not_started'
  | 'stuck'
  | 'queued';

export interface PipelineAttentionRow {
  datasetId: string;
  slug: string;
  title: string;
  catalogueStatus: string;
  ingestionStatus: string;
  attentionKind: PipelineAttentionKind;
  developmentPartnerId: string | null;
  organisationName: string | null;
  organisationAcronym: string | null;
  lastJobStatus: string | null;
  lastJobError: string | null;
  lastJobStage: string | null;
  lastJobProgress: number | null;
  lastJobAt: string | null;
  canRetry: boolean;
  canForceRetry: boolean;
  blockReason: string | null;
}

export interface PipelineAttentionResult {
  items: PipelineAttentionRow[];
  total: number;
  summary: {
    failed: number;
    notStarted: number;
    stuck: number;
    queued: number;
  };
}

export async function listPipelineAttention(params?: {
  filter?: PipelineAttentionFilter;
  limit?: number;
  offset?: number;
}): Promise<PipelineAttentionResult> {
  const response = await apiClient.get<ApiResponse<PipelineAttentionResult>>(
    '/admin/governance/ingestion/pipeline-attention',
    { params },
  );
  return response.data.data;
}

export interface PipelineCompletedRow {
  datasetId: string;
  slug: string;
  title: string;
  catalogueStatus: string;
  ingestionStatus: string;
  developmentPartnerId: string | null;
  organisationName: string | null;
  organisationAcronym: string | null;
  lastJobStatus: string | null;
  lastJobStage: string | null;
  lastJobAt: string | null;
  analyticsPublishedAt: string | null;
  fitnessVerdict: string | null;
  publishableRows: number;
  pendingAliases: number;
  warehouseEligible: boolean;
}

export interface PipelineCompletedResult {
  items: PipelineCompletedRow[];
  total: number;
  summary: {
    readyForReview: number;
    published: number;
    retracted: number;
  };
}

export async function listPipelineCompleted(params?: {
  limit?: number;
  offset?: number;
}): Promise<PipelineCompletedResult> {
  const response = await apiClient.get<ApiResponse<PipelineCompletedResult>>(
    '/admin/governance/ingestion/pipeline-completed',
    { params },
  );
  return response.data.data;
}

// Lists every status (pending/confirmed/rejected), scoped to one dataset,
// with both dataset titles already joined in for display.
export async function listRelations(params?: {
  datasetId?: string;
  status?: RelationStatus;
}): Promise<RelationView[]> {
  const response = await apiClient.get<ApiResponse<RelationView[]>>(
    '/admin/governance/ingestion/relations',
    { params }
  );
  return response.data.data;
}

export async function confirmRelation(id: string): Promise<DatasetRelation> {
  const response = await apiClient.post<ApiResponse<DatasetRelation>>(
    `/admin/governance/ingestion/relations/${id}/confirm`,
    {}
  );
  return response.data.data;
}

export async function rejectRelation(id: string): Promise<DatasetRelation> {
  const response = await apiClient.post<ApiResponse<DatasetRelation>>(
    `/admin/governance/ingestion/relations/${id}/reject`,
    {}
  );
  return response.data.data;
}
