import { ApiError } from "@/lib/api/client";

/** Statuses that mean "try again shortly", not "the request is wrong". */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

/**
 * True when a failed request is worth retrying: no answer at all (network error;
 * a proxy that is overloaded answers without CORS headers, which the browser
 * reports the same way), or an overload / gateway status. A 400, 401, 403 or 404
 * is a real answer and retrying it would only add load.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof ApiError) return TRANSIENT_STATUSES.has(error.status);
  return error instanceof TypeError;
}

export const MAX_QUERY_RETRIES = 3;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isTransientError(error);
}

/** 1s, 2s, 4s (capped at 8s) plus up to 400ms of jitter so retries do not arrive together. */
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000) + Math.random() * 400;
}
