export const SYSTEM_HEALTH_PAGE_TIP =
  "Live dependency checks for PostgreSQL, Redis, and object storage, plus Bull queue depths and dead-letter jobs. Public probes: GET /api/v1/health (liveness) and GET /api/v1/ready (postgres + redis readiness).";

export const SYSTEM_HEALTH_DEPENDENCIES_TIP =
  "Each card is probed on demand when you open or refresh this page. Unavailable means the API cannot reach that service — contact the platform team.";

export const SYSTEM_HEALTH_QUEUE_TIPS = {
  overview:
    "Background workers drain validation, upload, publish, analytics, and notification queues. Degraded usually means backlog, paused queues, or dead-letter jobs.",
  waiting:
    "Jobs waiting to start. A sustained climb often means background processing is stopped or stuck.",
  failed:
    "Failed attempts still in queue memory. Persistent failures may move to the Dead letter tab.",
} as const;

export const SYSTEM_HEALTH_DEAD_LETTER_TIP =
  "Jobs that exhausted every retry land here. Fix the root cause (missing file, DB timeout, deploy bug), then replay. Discard only obsolete jobs.";

export const SYSTEM_HEALTH_WORKER_TIP =
  "Workers run separately from the API. If none report, contact the platform team to restart background processing.";
