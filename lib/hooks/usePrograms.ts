import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProgrammes,
  getProgrammeBySlug,
  createProgramme,
  updateProgramme,
  archiveProgramme,
  getProgrammeReports,
  createProgrammeReport,
  deleteProgrammeReport,
  getProgrammeImages,
  uploadProgrammeImage,
  updateProgrammeImage,
  reorderProgrammeImages,
  deleteProgrammeImage,
  type CreateProgrammeReportPayload,
  type CreateProgrammePayload,
  type UpdateProgrammePayload,
  type GetProgrammesParams,
} from '../api/programs';

export function usePrograms(params?: GetProgrammesParams) {
  return useQuery({
    queryKey: ['programmes', params],
    queryFn: () => getProgrammes(params),
    placeholderData: keepPreviousData,
  });
}

export function useProgramBySlug(slug: string) {
  return useQuery({
    queryKey: ['programme', slug],
    queryFn: () => getProgrammeBySlug(slug),
    enabled: !!slug,
  });
}

export function useProgramImages(slug: string) {
  return useQuery({
    queryKey: ['programme-images', slug],
    queryFn: () => getProgrammeImages(slug),
    enabled: !!slug,
  });
}

/** Photo actions for one programme; each refreshes the gallery and the programme lists. */
export function useProgramImageActions(slug: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['programme-images', slug] });
    queryClient.invalidateQueries({ queryKey: ['programme', slug] });
    queryClient.invalidateQueries({ queryKey: ['programmes'] });
  };
  return {
    upload: useMutation({
      mutationFn: (file: File) => uploadProgrammeImage(slug, file),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: {
        imageId: string;
        data: { caption?: string; alt?: string; isCover?: boolean };
      }) => updateProgrammeImage(slug, v.imageId, v.data),
      onSuccess: refresh,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) => reorderProgrammeImages(slug, ids),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (imageId: string) => deleteProgrammeImage(slug, imageId),
      onSuccess: refresh,
    }),
  };
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProgrammePayload) => createProgramme(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] });
    },
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: UpdateProgrammePayload }) =>
      updateProgramme(slug, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] });
      queryClient.invalidateQueries({ queryKey: ['programme', variables.slug] });
    },
  });
}

export function useArchiveProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => archiveProgramme(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] });
    },
  });
}

export function useProgramReports(slug: string) {
  return useQuery({
    queryKey: ['programme-reports', slug],
    queryFn: () => getProgrammeReports(slug),
    enabled: !!slug,
  });
}

export function useCreateProgramReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: CreateProgrammeReportPayload }) =>
      createProgrammeReport(slug, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['programme-reports', variables.slug] });
    },
  });
}

export function useDeleteProgramReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, reportId }: { slug: string; reportId: string }) =>
      deleteProgrammeReport(slug, reportId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['programme-reports', variables.slug] });
    },
  });
}
