import type { MetricTone } from "@/components/admin/admin-analytics-ui";

export type IngestionFitnessVerdict = "ok" | "flagged" | "rejected_unusable";

export type IngestionFitnessReason =
  | "UNSUPPORTED_FORMAT"
  | "ZERO_OBSERVATIONS"
  | "UNKNOWN_SHEETS"
  | "NON_OBSERVATION_STRUCTURE"
  | "HIGH_OUT_OF_SCOPE"
  | "LOW_USABLE_RATE"
  | "WRONG_GEOGRAPHY_HINT"
  | "HIGH_ORG_PENDING"
  | "HIGH_INDICATOR_PENDING";

export interface IngestionFitnessMetrics {
  observations: number;
  outOfScope: number;
  outOfScopePct: number;
  orgPending: number;
  orgPendingPct: number;
  periodUnresolved: number;
  periodUnresolvedPct: number;
  indicatorPending: number;
  indicatorPendingPct: number;
  usable: number;
  usablePct: number;
  unknownSheets: number;
  archivedSheets: number;
  totalSheets: number;
}

export interface IngestionFitness {
  verdict: IngestionFitnessVerdict;
  reasons: IngestionFitnessReason[];
  metrics: IngestionFitnessMetrics;
  computedAt: string;
  notifiedAt?: string | null;
  notifiedVerdict?: IngestionFitnessVerdict | null;
}

/** Reasons that mean "different workbook shape", not bad data quality. */
const CATALOGUE_ONLY_REASONS = new Set<IngestionFitnessReason>([
  "UNSUPPORTED_FORMAT",
  "ZERO_OBSERVATIONS",
  "UNKNOWN_SHEETS",
  "NON_OBSERVATION_STRUCTURE",
]);

export const FITNESS_VERDICT_LABEL: Record<IngestionFitnessVerdict, string> = {
  ok: "Fit for warehouse",
  flagged: "Not loaded into analytics",
  rejected_unusable: "Rejected for analytics",
};

export const FITNESS_REASON_LABEL: Record<IngestionFitnessReason, string> = {
  UNSUPPORTED_FORMAT:
    "This file type is not a table of indicator values (the warehouse reads CSV and Excel tables).",
  ZERO_OBSERVATIONS: "No indicator values were found in the file.",
  UNKNOWN_SHEETS:
    "The sheets are not laid out as a table of numbers by place and period.",
  NON_OBSERVATION_STRUCTURE:
    "It looks like a register, form or plan, not a table of numbers by place and period.",
  HIGH_OUT_OF_SCOPE: "Many rows are for places outside Niger State.",
  LOW_USABLE_RATE: "Almost none of the rows could be used.",
  WRONG_GEOGRAPHY_HINT: "The title or sheet names suggest another state.",
  HIGH_ORG_PENDING:
    "Place names in the rows (such as communities) do not match any ward or LGA.",
  HIGH_INDICATOR_PENDING:
    "Many column headings do not match a known indicator yet (see the Aliases tab).",
};

/** The file's shape alone says it is not an indicator table (register, form, list, plan). */
export function hasShapeSignal(fitness: IngestionFitness): boolean {
  return fitness.reasons.some((reason) => CATALOGUE_ONLY_REASONS.has(reason));
}

/**
 * Nothing is usable and nothing is waiting to be fixed (no names, headings or periods to
 * resolve, no out-of-area rows), so a person has nothing to do.
 */
export function hasNothingToFix(fitness: IngestionFitness): boolean {
  if (fitness.metrics.usable !== 0) return false;
  if (hasShapeSignal(fitness)) return true;
  const m = fitness.metrics;
  return (
    m.orgPending === 0 &&
    m.indicatorPending === 0 &&
    m.periodUnresolved === 0 &&
    m.outOfScope === 0
  );
}

export function isCatalogueOnlyFitness(fitness: IngestionFitness): boolean {
  if (fitness.verdict !== "rejected_unusable") return false;
  if (fitness.reasons.length === 0) return true;
  return fitness.reasons.every((reason) => CATALOGUE_ONLY_REASONS.has(reason));
}

/** User-facing verdict — softer when the file is valid but not warehouse-shaped. */
export function fitnessVerdictLabel(fitness: IngestionFitness): string {
  if (fitness.verdict === "ok") return FITNESS_VERDICT_LABEL.ok;
  if (fitness.verdict === "flagged") {
    return hasNothingToFix(fitness)
      ? FITNESS_VERDICT_LABEL.flagged
      : "Check before loading into analytics";
  }
  if (isCatalogueOnlyFitness(fitness)) return "Not analytics-shaped";
  return FITNESS_VERDICT_LABEL.rejected_unusable;
}

export function fitnessVerdictDescription(fitness: IngestionFitness): string {
  if (fitness.verdict === "flagged") {
    if (hasNothingToFix(fitness)) {
      return "This file has no indicator values the warehouse can use. It is still published in the catalogue. Nothing to fix if it is meant for the catalogue.";
    }
    return "Some rows could not be used yet. Check the Aliases tab, then re-run the ingestion.";
  }
  if (
    fitness.verdict === "rejected_unusable" &&
    isCatalogueOnlyFitness(fitness)
  ) {
    return "This file did not yield indicator rows for the analytics warehouse. Catalogue publish is still fine — it may be a different type of health data.";
  }
  if (fitness.verdict === "rejected_unusable") {
    return "This upload is unlikely to yield publishable warehouse data. Review the report before loading analytics.";
  }
  return "No analytics fitness concerns.";
}

export function fitnessTone(verdict: IngestionFitnessVerdict): MetricTone {
  if (verdict === "rejected_unusable") return "destructive";
  if (verdict === "flagged") return "warning";
  return "success";
}

export function fitnessDisplayTone(fitness: IngestionFitness): MetricTone {
  if (fitness.verdict === "ok") return "success";
  if (fitness.verdict === "flagged") {
    return hasNothingToFix(fitness) ? "info" : "warning";
  }
  if (isCatalogueOnlyFitness(fitness)) return "info";
  return "destructive";
}

export function needsFitnessAttention(
  fitness: IngestionFitness | null | undefined,
): fitness is IngestionFitness {
  return !!fitness && fitness.verdict !== "ok";
}

export function formatFitnessReason(reason: string): string {
  return FITNESS_REASON_LABEL[reason as IngestionFitnessReason] ?? reason;
}

/** True when preflight marked the file as a geography/denominator table. */
export function isCatalogueOnlyReport(
  report: Record<string, unknown> | null | undefined,
): boolean {
  const preflight = report?.preflight as
    { referenceOnly?: boolean } | undefined;
  return Boolean(preflight?.referenceOnly);
}

/** True when analytics is the wrong product for this file — not a failure. */
export function isAnalyticsNotApplicable(
  fitness: IngestionFitness | null | undefined,
  report?: Record<string, unknown> | null,
): boolean {
  if (fitness && isCatalogueOnlyFitness(fitness)) return true;
  return isCatalogueOnlyReport(report);
}

/** Hard block warehouse load for quality rejection. Catalogue-only is not a block. */
export function blocksPublishByFitness(
  fitness: IngestionFitness | null | undefined,
): boolean {
  if (!fitness || fitness.verdict !== "rejected_unusable") return false;
  return !isCatalogueOnlyFitness(fitness);
}

export function publishBlockedByFitnessMessage(
  fitness: IngestionFitness,
): string {
  const summary =
    fitness.reasons.length > 0
      ? fitness.reasons.map(formatFitnessReason).join("; ")
      : "no warehouse observations";

  if (isCatalogueOnlyFitness(fitness)) {
    return `Not an indicator grid (${summary}). Catalogue publish is the outcome — there is no analytics pipeline for this file.`;
  }

  return `Analytics load blocked: ${fitnessVerdictLabel(fitness)} (${summary}). Open Ingestion to review the report.`;
}
