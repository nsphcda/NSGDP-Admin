import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/ingestion-ops';

const OBSERVABILITY_KEY = 'ingestion-observability';
const QUEUE_HEALTH_KEY = 'queue-health';
const DEAD_LETTER_KEY = 'dead-letter';
const SUCCESSION_KEY = 'succession-candidates';
const CHANGEPOINTS_KEY = 'changepoints';
const CONFLICTS_SUMMARY_KEY = 'conflict-dataset-summaries';
const CONFLICTS_PERIODS_KEY = 'conflict-period-options';
const CONFLICTS_LOCATIONS_KEY = 'conflict-location-options';
const CONFLICTS_SOURCES_KEY = 'conflict-source-options';
const CONFLICTS_KEY = 'observation-conflicts';
const STALE_CONFLICTS_KEY = 'stale-resolved-conflicts';

export function useObservability() {
  return useQuery({
    queryKey: [OBSERVABILITY_KEY],
    queryFn: api.getObservability,
  });
}

export function useQueueHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [QUEUE_HEALTH_KEY],
    queryFn: api.getQueueHealth,
    enabled: options?.enabled !== false,
    refetchInterval: 10_000,
  });
}

export function useDeadLetterJobs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [DEAD_LETTER_KEY],
    queryFn: () => api.getDeadLetterJobs(),
    enabled: options?.enabled !== false,
    refetchInterval: 10_000,
  });
}

export function useRetryDeadLetterJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryDeadLetterJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEAD_LETTER_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUEUE_HEALTH_KEY] });
    },
  });
}

export function useDiscardDeadLetterJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.discardDeadLetterJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEAD_LETTER_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUEUE_HEALTH_KEY] });
    },
  });
}

export function useAiSpend(days = 7) {
  return useQuery({
    queryKey: ['ai-spend', days],
    queryFn: () => api.getAiSpend(days),
  });
}

export function useRunCalibration() {
  return useMutation({
    mutationFn: api.runCalibration,
  });
}

export function useRunShiftDetection() {
  return useMutation({ mutationFn: api.runShiftDetection });
}

export function useRunChangepointScan() {
  return useMutation({ mutationFn: api.runChangepointScan });
}

export function useRunRelationMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.runRelationMatch,
    onSuccess: () => {
      // A fresh confirmed relation could now exist for any dataset —
      // broad invalidation is correct here since matching runs globally.
      queryClient.invalidateQueries({ queryKey: ['ingestion-related-datasets'] });
    },
  });
}

export function useSuccessionCandidates(status?: 'pending' | 'confirmed' | 'rejected') {
  return useQuery({
    queryKey: [SUCCESSION_KEY, status],
    queryFn: () => api.listSuccessionCandidates(status),
  });
}

export function useConfirmSuccession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.confirmSuccession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SUCCESSION_KEY] }),
  });
}

export function useRejectSuccession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectSuccession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SUCCESSION_KEY] }),
  });
}

export function useChangepoints(status?: 'pending' | 'confirmed' | 'rejected') {
  return useQuery({
    queryKey: [CHANGEPOINTS_KEY, status],
    queryFn: () => api.listChangepoints(status),
  });
}

export function useConfirmChangepoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.confirmChangepoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHANGEPOINTS_KEY] }),
  });
}

export function useRejectChangepoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectChangepoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHANGEPOINTS_KEY] }),
  });
}

export function useConflictDatasetSummaries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [CONFLICTS_SUMMARY_KEY],
    queryFn: api.getConflictDatasetSummaries,
    enabled: options?.enabled !== false,
  });
}

export function useConflictPeriodOptions(datasetBId?: string, lgaId?: string) {
  return useQuery({
    queryKey: [CONFLICTS_PERIODS_KEY, datasetBId ?? 'all', lgaId ?? 'all'],
    queryFn: () => api.getConflictPeriodOptions(datasetBId, lgaId),
  });
}

export function useConflictLocationOptions(params: {
  datasetBId?: string;
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
}) {
  return useQuery({
    queryKey: [CONFLICTS_LOCATIONS_KEY, params],
    queryFn: () => api.getConflictLocationOptions(params),
  });
}

export function useConflictSourceOptions(params: {
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
  datasetBId?: string;
  lgaId?: string;
}) {
  return useQuery({
    queryKey: [CONFLICTS_SOURCES_KEY, params],
    queryFn: () =>
      api.getConflictSourceOptions({
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        periodQuarter: params.periodQuarter,
        datasetBId: params.datasetBId,
        lgaId: params.lgaId,
      }),
    enabled:
      params.periodYear != null ||
      Boolean(params.datasetBId) ||
      Boolean(params.lgaId),
  });
}

export function useObservationConflictCells(params: {
  datasetBId?: string;
  periodYear?: number;
  periodMonth?: number;
  periodQuarter?: number;
  lgaId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [CONFLICTS_KEY, 'cells', params],
    queryFn: () => api.getObservationConflictCells(params),
  });
}

function invalidateConflictQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [CONFLICTS_SUMMARY_KEY] });
  queryClient.invalidateQueries({ queryKey: [CONFLICTS_PERIODS_KEY] });
  queryClient.invalidateQueries({ queryKey: [CONFLICTS_LOCATIONS_KEY] });
  queryClient.invalidateQueries({ queryKey: [CONFLICTS_SOURCES_KEY] });
  queryClient.invalidateQueries({ queryKey: [CONFLICTS_KEY] });
  queryClient.invalidateQueries({ queryKey: [OBSERVABILITY_KEY] });
  queryClient.invalidateQueries({ queryKey: ["admin", "analytics", "governance"] });
}

export function useResolveObservationConflicts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.resolveObservationConflicts,
    onSuccess: () => invalidateConflictQueries(queryClient),
  });
}

export function useStaleResolvedConflictSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [STALE_CONFLICTS_KEY, 'summary'],
    queryFn: api.getStaleResolvedConflictSummary,
    enabled: options?.enabled !== false,
  });
}

export function useStaleResolvedConflicts(page = 1, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [STALE_CONFLICTS_KEY, page],
    queryFn: () => api.getStaleResolvedConflicts({ page, limit: 10 }),
    enabled: options?.enabled !== false,
  });
}

function invalidateQueueState(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [QUEUE_HEALTH_KEY] });
  queryClient.invalidateQueries({ queryKey: ['system-health'] });
}

export function useQueueControls() {
  const queryClient = useQueryClient();
  const onSuccess = () => invalidateQueueState(queryClient);
  const pause = useMutation({ mutationFn: api.pauseQueue, onSuccess });
  const resume = useMutation({ mutationFn: api.resumeQueue, onSuccess });
  const clean = useMutation({ mutationFn: api.cleanQueue, onSuccess });
  const drain = useMutation({
    mutationFn: ({ queue, confirm }: { queue: string; confirm: string }) =>
      api.drainQueue(queue, confirm),
    onSuccess,
  });
  return { pause, resume, clean, drain };
}
