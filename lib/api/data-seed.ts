import { apiClient } from "./client";
import type { ApiResponse } from "../types/common";

export interface DataSeedOptions {
  includeCaseRecords: boolean;
  includeReferenceTools: boolean;
}

export interface SeedPlanItem {
  id: string;
  kind: "dataset" | "document";
  title: string;
  visibility: "public" | "restricted";
  group: string;
  files: number;
  bytes: number;
  /** Set when the server already has it: a dataset status, "published" or "in library". */
  existing: string | null;
  filesMissing: string[];
}

export type SeedItemStatus = "waiting" | "running" | "published" | "skipped" | "failed";

export interface SeedItemState extends SeedPlanItem {
  status: SeedItemStatus;
  detail?: string;
  steps: string[];
}

export interface DictionarySeedReport {
  dictionaryVersion: string;
  indicatorsCreated: number;
  indicatorsExisting: number;
  aliasesCreated: number;
  aliasesAdopted: number;
  aliasesSkippedExisting: number;
  aliasesSkippedHuman: number;
}

export interface SeedRunState {
  id: string;
  state: "running" | "finished";
  startedAt: string;
  finishedAt?: string;
  options: DataSeedOptions;
  items: SeedItemState[];
  dictionary: DictionarySeedReport | null;
  dictionaryError?: string;
  summary: { total: number; published: number; skipped: number; failed: number };
}

export async function getDataSeedPlan(options: DataSeedOptions): Promise<SeedPlanItem[]> {
  const response = await apiClient.get<ApiResponse<SeedPlanItem[]>>("/admin/data-seed/plan", {
    params: {
      caseRecords: options.includeCaseRecords,
      referenceTools: options.includeReferenceTools,
    },
  });
  return response.data.data;
}

export async function startDataSeed(options: DataSeedOptions): Promise<SeedRunState> {
  const response = await apiClient.post<ApiResponse<SeedRunState>>("/admin/data-seed/run", options);
  return response.data.data;
}

export async function getDataSeedStatus(): Promise<SeedRunState | null> {
  const response = await apiClient.get<ApiResponse<{ run: SeedRunState | null }>>(
    "/admin/data-seed/status",
  );
  return response.data.data.run;
}
