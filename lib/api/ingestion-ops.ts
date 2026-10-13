import { apiClient } from './client';

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  timestamp: string;
  path: string;
  data: T;
}

export interface ObservabilitySnapshot {
  autoResolutionRate: number;
  stagingTotal: number;
  indicatorPending: number;
  reviewQueueAge: {
    p50Seconds: number;
    p95Seconds: number;
    pendingAliases: number;
    pendingOrgunitAliases: number;
  };
  openConflictsTotal: number;
  conflictsPerDataset: Array<{
    datasetId: string;
    slug: string;
    title: string;
    conflicts: number;
  }>;
  speciesDistribution: Array<{ species: string; sheets: number }>;
  ai: {
    calls30d: number;
    cacheHitRate: number;
    spendUsd30d: number;
  };
  targets: {
    month1AutoResolution: number;
    month3AutoResolution: number;
  };
}

export interface QueueDepth {
  queue: string;
  concurrency: number;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
  oldestWaitingAgeMs: number | null;
}

export interface WorkerHeartbeat {
  id: string;
  host: string;
  pid: number;
  startedAt: string;
  lastBeatAt: string;
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  eventLoopLagMs: number;
  concurrency: Record<string, number>;
}

export interface QueueRedisHealth {
  snapshot: {
    policy: string | null;
    usedBytes: number;
    maxBytes: number;
    evictedKeys: number;
  };
  checkedAt: string;
  errors: string[];
  warnings: string[];
}

export interface QueuesHealth {
  status: 'healthy' | 'degraded';
  warnings: string[];
  deadLetterCount: number;
  queues: QueueDepth[];
  /** Live worker processes. Optional so an older API still renders. */
  workers?: WorkerHeartbeat[];
  redis?: QueueRedisHealth | null;
  checkedAt: string;
}

export async function pauseQueue(queue: string): Promise<void> {
  await apiClient.post(`/admin/queues/${encodeURIComponent(queue)}/pause`, {});
}

export async function resumeQueue(queue: string): Promise<void> {
  await apiClient.post(`/admin/queues/${encodeURIComponent(queue)}/resume`, {});
}

export async function cleanQueue(
  queue: string,
): Promise<{ queue: string; removed: { completed: number; failed: number } }> {
  const response = await apiClient.post<
    ApiResponse<{ queue: string; removed: { completed: number; failed: number } }>
  >(`/admin/queues/${encodeURIComponent(queue)}/clean`, {});
  return response.data.data;
}

export async function drainQueue(queue: string, confirm: string): Promise<void> {
  await apiClient.post(`/admin/queues/${encodeURIComponent(queue)}/drain`, {
    confirm,
  });
}

export interface DeadLetterEntry {
  id: string;
  payload: {
    queue: string;
    jobName: string;
    originalJobId: string;
    data: unknown;
    attemptsMade: number;
    failedReason: string;
  };
  createdAt: string;
}

export async function getObservability(): Promise<ObservabilitySnapshot> {
  const response = await apiClient.get<ApiResponse<ObservabilitySnapshot>>(
    '/admin/governance/ingestion/observability'
  );
  return response.data.data;
}

export async function getQueueHealth(): Promise<QueuesHealth> {
  const response = await apiClient.get<ApiResponse<QueuesHealth>>('/admin/queues/health');
  return response.data.data;
}

export async function getDeadLetterJobs(limit = 50): Promise<DeadLetterEntry[]> {
  const response = await apiClient.get<ApiResponse<DeadLetterEntry[]>>('/admin/queues/dead-letter', {
    params: { limit },
  });
  return response.data.data;
}

export async function retryDeadLetterJob(id: string): Promise<{ queue: string; jobId: string }> {
  const response = await apiClient.post<ApiResponse<{ queue: string; jobId: string }>>(
    `/admin/queues/dead-letter/${id}/retry`,
    {}
  );
  return response.data.data;
}

export async function discardDeadLetterJob(id: string): Promise<void> {
  await apiClient.delete(`/admin/queues/dead-letter/${id}`);
}

export interface AiSpendReport {
  budget: { day: string; tokensUsed: number; costUsd: number };
  circuit: { open: boolean; openUntil: number | null; failures: number };
  periodDays: number;
  totalCostUsd: number;
  totalTokens: number;
  cacheHitRate: number;
  byTask: Array<{
    task: string;
    calls: number;
    cacheHits: number;
    skipped: number;
    costUsd: number;
    acceptanceRate: number | null;
  }>;
}

export async function getAiSpend(days = 7): Promise<AiSpendReport> {
  const response = await apiClient.get<ApiResponse<AiSpendReport>>('/admin/ai/spend', { params: { days } });
  return response.data.data;
}

// The calibration report is only ever returned as the result of running a
// fresh calibration — there is no separate "get last report" endpoint, so
// the last run's result only lives in this session's UI state (or the
// committed docs/calibration-report.json snapshot on the backend repo).
export interface CalibrationReport {
  evaluatedAt: string;
  modelTag: string;
  pairs: number;
  autoThreshold: number;
  reviewThreshold: number;
  autoPrecision: number;
  autoRecall: number;
  reviewPrecision: number;
  reviewRecall: number;
  sweep: Array<{ threshold: number; precision: number; recall: number; tp: number; fp: number; fn: number }>;
}

export async function runCalibration(): Promise<CalibrationReport> {
  const response = await apiClient.post<ApiResponse<CalibrationReport>>(
    '/admin/governance/ingestion/calibration/run',
    {}
  );
  return response.data.data;
}

export interface SuccessionCandidate {
  id: string;
  predecessorId: string;
  predecessorName: string;
  successorId: string;
  successorName: string;
  embeddingSimilarity: string;
  status: 'pending' | 'confirmed' | 'rejected';
  detectedAt: string;
}

export interface ChangepointAnnotation {
  id: string;
  indicatorId: string;
  indicatorName: string;
  periodYear: number;
  periodMonth: number | null;
  lgaShare: string;
  method: string;
  note: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  detectedAt: string;
}

export async function listSuccessionCandidates(
  status?: 'pending' | 'confirmed' | 'rejected'
): Promise<SuccessionCandidate[]> {
  const response = await apiClient.get<ApiResponse<SuccessionCandidate[]>>(
    '/admin/governance/ingestion/succession-candidates',
    { params: { status } }
  );
  return response.data.data;
}

export async function confirmSuccession(id: string): Promise<unknown> {
  const response = await apiClient.post<ApiResponse<unknown>>(
    `/admin/governance/ingestion/succession/${id}/confirm`,
    {}
  );
  return response.data.data;
}

export async function rejectSuccession(id: string): Promise<unknown> {
  const response = await apiClient.post<ApiResponse<unknown>>(
    `/admin/governance/ingestion/succession/${id}/reject`,
    {}
  );
  return response.data.data;
}

export async function listChangepoints(
  status?: 'pending' | 'confirmed' | 'rejected'
): Promise<ChangepointAnnotation[]> {
  const response = await apiClient.get<ApiResponse<ChangepointAnnotation[]>>(
    '/admin/governance/ingestion/changepoints',
    { params: { status } }
  );
  return response.data.data;
}

export async function confirmChangepoint(id: string): Promise<unknown> {
  const response = await apiClient.post<ApiResponse<unknown>>(
    `/admin/governance/ingestion/changepoints/${id}/confirm`,
    {}
  );
  return response.data.data;
}

export async function rejectChangepoint(id: string): Promise<unknown> {
  const response = await apiClient.post<ApiResponse<unknown>>(
    `/admin/governance/ingestion/changepoints/${id}/reject`,
    {}
  );
  return response.data.data;
}

// Stage 8 background scans. Each returns a count of new candidates
// written on top of whatever's already pending — call the list functions
// above afterward (or just invalidate their query keys) to see them.
export async function runShiftDetection(): Promise<number> {
  const response = await apiClient.post<ApiResponse<number>>(
    '/admin/governance/ingestion/shift-detection/run',
    {}
  );
  return response.data.data;
}

export async function runChangepointScan(): Promise<number> {
  const response = await apiClient.post<ApiResponse<number>>(
    '/admin/governance/ingestion/changepoints/run',
    {}
  );
  return response.data.data;
}

export async function runRelationMatch(): Promise<number> {
  const response = await apiClient.post<ApiResponse<number>>(
    '/admin/governance/ingestion/relations/match',
    {}
  );
  return response.data.data;
}

export interface ConflictDatasetSummary {
  datasetId: string;
  slug: string;
  title: string;
  openConflicts: number;
  ingestionStatus: string | null;
  analyticsPublished: boolean;
}

export interface ObservationConflictRow {
  id: string;
  indicatorId: string;
  indicatorName: string;
  indicatorSlug: string;
  periodYear: number;
  periodMonth: number | null;
  periodQuarter: number | null;
  lgaId: string | null;
  lgaName: string | null;
  wardId: string | null;
  wardName: string | null;
  facilityId: string | null;
  facilityName: string | null;
  datasetAId: string;
  datasetASlug: string;
  datasetATitle: string;
  datasetBId: string;
  datasetBSlug: string;
  datasetBTitle: string;
  valueA: string | null;
  valueB: string | null;
  createdAt: string;
}

export interface PaginatedConflicts {
  data: ObservationConflictRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ConflictCellCandidate {
  datasetId: string;
  slug: string;
  title: string;
  value: string | null;
  isLiveWarehouse: boolean;
}

export interface ConflictCell {
  cellKey: string;
  indicatorId: string;
  indicatorName: string;
  indicatorSlug: string;
  periodYear: number;
  periodMonth: number | null;
  periodQuarter: number | null;
  lgaId: string | null;
  lgaName: string | null;
  wardId: string | null;
  wardName: string | null;
  facilityId: string | null;
  facilityName: string | null;
  conflictIds: string[];
  candidates: ConflictCellCandidate[];
  liveWarehouseDatasetId: string | null;
}

export interface PaginatedConflictCells {
  data: ConflictCell[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export type ConflictPrecedence = 'warehouse' | 'incoming';

export async function getConflictDatasetSummaries(): Promise<ConflictDatasetSummary[]> {
  const response = await apiClient.get<ApiResponse<ConflictDatasetSummary[]>>(
    '/admin/governance/ingestion/conflicts/summary'
  );
  return response.data.data;
}

export interface ConflictPeriodOption {
  periodYear: number;
  periodMonth: number | null;
  periodQuarter: number | null;
  label: string;
  openConflicts: number;
}

export async function getConflictPeriodOptions(
  datasetBId?: string,
  lgaId?: string
): Promise<ConflictPeriodOption[]> {
  const params: Record<string, string> = {};
  if (datasetBId) params.datasetBId = datasetBId;
  if (lgaId) params.lgaId = lgaId;
  const response = await apiClient.get<ApiResponse<ConflictPeriodOption[]>>(
    '/admin/governance/ingestion/conflicts/periods',
    { params: Object.keys(params).length ? params : undefined }
  );
  return response.data.data;
}

export interface ConflictLocationOption {
  lgaId: string;
  lgaName: string;
  openCells: number;
}

export async function getConflictLocationOptions(params: {
  datasetBId?: string;
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
}): Promise<ConflictLocationOption[]> {
  const response = await apiClient.get<ApiResponse<ConflictLocationOption[]>>(
    '/admin/governance/ingestion/conflicts/locations',
    { params }
  );
  return response.data.data;
}

export interface ConflictSourceOption {
  datasetId: string;
  slug: string;
  title: string;
  openCells: number;
}

export async function getConflictSourceOptions(params: {
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
  datasetBId?: string;
  lgaId?: string;
}): Promise<ConflictSourceOption[]> {
  const response = await apiClient.get<ApiResponse<ConflictSourceOption[]>>(
    '/admin/governance/ingestion/conflicts/sources',
    { params }
  );
  return response.data.data;
}

export async function getObservationConflictCells(params: {
  datasetBId?: string;
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
  lgaId?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedConflictCells> {
  const response = await apiClient.get<ApiResponse<PaginatedConflictCells>>(
    '/admin/governance/ingestion/conflicts/cells',
    { params }
  );
  return response.data.data;
}

export async function resolveObservationConflicts(body: {
  conflictIds?: string[];
  datasetBId?: string;
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
  lgaId?: string;
  precedence?: ConflictPrecedence;
  winnerDatasetId?: string;
}): Promise<{ resolved: number }> {
  const response = await apiClient.post<ApiResponse<{ resolved: number }>>(
    '/admin/governance/ingestion/conflicts/resolve',
    body
  );
  return response.data.data;
}

export interface StaleResolvedConflictSummary {
  staleResolvedCount: number;
}

export interface StaleResolvedConflictRow extends ObservationConflictRow {
  resolvedAt: string;
  precedenceDatasetId: string;
  precedenceDatasetTitle: string;
  staleReason: string;
}

export async function getStaleResolvedConflictSummary(): Promise<StaleResolvedConflictSummary> {
  const response = await apiClient.get<ApiResponse<StaleResolvedConflictSummary>>(
    '/admin/governance/ingestion/conflicts/stale/summary'
  );
  return response.data.data;
}

export async function getStaleResolvedConflicts(params: {
  page?: number;
  limit?: number;
}): Promise<PaginatedConflicts & { data: StaleResolvedConflictRow[] }> {
  const response = await apiClient.get<
    ApiResponse<PaginatedConflicts & { data: StaleResolvedConflictRow[] }>
  >('/admin/governance/ingestion/conflicts/stale', { params });
  return response.data.data;
}
