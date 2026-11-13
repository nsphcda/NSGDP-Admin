import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  getGisReferenceLayers,
  uploadGisReferenceLayer,
  getGisJobStatus,
  rebuildCanonicalWards,
  getGisResolutionReport,
  confirmGisWardAlias,
  searchWardsInLga,
  type GisReferenceSlot,
} from '../api/gis-reference';

export function useGisReferenceLayers() {
  return useQuery({
    queryKey: ['gis-reference-layers'],
    queryFn: getGisReferenceLayers,
  });
}

export function useUploadGisReferenceLayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slot,
      file,
      label,
      onUploadProgress,
    }: {
      slot: GisReferenceSlot;
      file: File;
      label?: string;
      onUploadProgress?: (percent: number) => void;
    }) => uploadGisReferenceLayer(slot, file, label, onUploadProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gis-reference-layers'] });
      queryClient.invalidateQueries({ queryKey: ['gis-resolution-report'] });
    },
  });
}

export function useGisJobStatus(jobId: string | null) {
  const [enabled, setEnabled] = useState(!!jobId);
  const query = useQuery({
    queryKey: ['gis-job', jobId],
    queryFn: () => getGisJobStatus(jobId as string),
    enabled: enabled && !!jobId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || status === 'completed' || status === 'failed' || status === 'not_found') {
        return false;
      }
      return 1000;
    },
  });

  useEffect(() => {
    setEnabled(!!jobId);
  }, [jobId]);

  return query;
}

export function useRebuildCanonicalWards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rebuildCanonicalWards,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gis-resolution-report'] });
    },
  });
}

export function useGisResolutionReport(slot: GisReferenceSlot | null) {
  return useQuery({
    queryKey: ['gis-resolution-report', slot],
    queryFn: () => getGisResolutionReport(slot as GisReferenceSlot),
    enabled: !!slot,
  });
}

export function useGisResolutionReports(
  slots: GisReferenceSlot[],
  /** When set, only these slots are fetched (lazy tab loading). */
  enabledSlots?: GisReferenceSlot[],
) {
  const enabledSet = enabledSlots ? new Set(enabledSlots) : null;
  return useQueries({
    queries: slots.map((slot) => ({
      queryKey: ['gis-resolution-report', slot],
      queryFn: () => getGisResolutionReport(slot),
      enabled:
        slots.length > 0 && (enabledSet == null || enabledSet.has(slot)),
      staleTime: 5 * 60 * 1000,
    })),
  });
}

export function useSearchWardsInLga(lga: string, q: string, open: boolean) {
  return useQuery({
    queryKey: ['gis-ward-search', lga, q],
    queryFn: () => searchWardsInLga(lga, q || undefined),
    // An empty LGA searches every ward, so the list is never blank just for lack of a hint.
    enabled: open,
  });
}

export function useConfirmGisWardAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmGisWardAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gis-resolution-report'] });
    },
  });
}
