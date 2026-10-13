/** Plain-language help copy for Ingestion Ops tabs and panels. */

export const INGESTION_OPS_PAGE_TIP =
  "Monitor uploads from spreadsheet to public charts. Use the Ingestion guide button for step-by-step help on each tab. Pipeline parses workbooks; Warehouse loads analytics.";

export const INGESTION_OPS_BACKFILL_TIP =
  "Re-scan approved datasets that never finished canonicalization and queue them again. Use when catch-up missed something — not for routine uploads.";

export const OPS_TAB_TOOLTIPS = {
  observability:
    "At-a-glance health: pipeline activity, warehouse loads, alias backlog, AI usage, and workbook layout mix.",
  pipeline:
    "Step 1 — canonicalization. Uploaded spreadsheets are parsed, indicators matched, and rows land in staging. Fix failures here before loading analytics.",
  aliases:
    "Names in uploads that did not auto-match the registry. Approve or reject so the same indicator is not duplicated.",
  "ai-spend":
    "Cost and volume of AI calls used to suggest indicator matches during canonicalization. High spend may mean many new or messy column names.",
  indicators:
    "Master list of diseases and metrics every upload resolves to. Inactive entries were proposed during ingestion and await activation.",
  warehouse:
    "Step 2 — analytics load. Approved staging rows are copied into disease_burden so public portal charts can use them.",
  compare:
    "Side-by-side check of two published datasets on the same indicator, LGA, and period. Useful for spotting double-counting or drift.",
  stage8:
    "Long-horizon data-quality scans: renamed indicators, reporting-form changes, cross-org duplicates, and embedding match tuning.",
  "queue-health":
    "Background job queues (ingestion, publish, email, etc.). Waiting or failed counts here mean workers may be stuck — not the same as a failed upload row.",
  "dead-letter":
    "Jobs that exhausted all retries. Replay after fixing the root cause, or discard if the job is obsolete.",
} as const;

export const PIPELINE_VIEW_TIPS = {
  running:
    "Workbooks currently queued or being parsed. Progress updates as each pipeline stage completes.",
  completed:
    "Canonicalization finished on analytics-shaped datasets. Blank templates, line lists and other non-analytics uploads are hidden.",
  needs_attention:
    "Canonicalization failed, stalled, or never started. Retry here — do not use Warehouse until these are cleared.",
} as const;

export const PIPELINE_ATTENTION_TIPS = {
  all: "Every dataset that needs a human look before analytics can load.",
  failed: "The last canonicalization job ended with an error.",
  incomplete: "Includes stuck jobs (no progress) and datasets that were approved but never ingested.",
} as const;

export const PIPELINE_ISSUE_TIPS = {
  failed: "The pipeline job crashed or rejected the workbook. Open the dataset ingestion page for the error detail.",
  not_started: "Approved for catalogue but canonicalization was never queued or finished.",
  stuck: "A job started but has not progressed — often a worker restart or blocking alias review.",
  queued: "Waiting for a worker slot. Should clear on its own unless the queue is backed up.",
} as const;

export const WAREHOUSE_FILTER_TIPS = {
  in_warehouse:
    "Datasets whose rows are already in analytics and visible to portal charts (unless retracted).",
  loading:
    "A publish job is running right now — rows are being written or updated in disease_burden.",
  ready:
    "Canonicalization finished and aliases are clear, but analytics load has not been started yet.",
  all: "Every dataset eligible for warehouse load, regardless of current phase.",
} as const;

export const WAREHOUSE_METRIC_TIPS = {
  in_warehouse: "Live in analytics — portal charts can read these burden rows.",
  ready_to_load:
    "Staging is clean and approved; click Load to copy rows into analytics.",
  loading_now: "Publish in progress. Refresh in a minute if this stays too long.",
  failed_loads:
    "The analytics publish job failed. Retry from this tab after checking the error on the dataset.",
} as const;

export const METRICS_PANEL_TIPS = {
  pipeline:
    "Canonicalization only — parsing workbooks into staging. Problems here block everything downstream.",
  warehouse:
    "Analytics load — moving resolved staging into disease_burden for public charts.",
  review:
    "Human review backlog and data-quality signals that slow or block auto-matching.",
  ai: "AI assist during canonicalization — matching messy column names to the indicator registry.",
  species:
    "How uploaded spreadsheets were classified (layout type). Helps spot unusual formats driving failures.",
} as const;

export const METRICS_CARD_TIPS = {
  staging_rows:
    "Raw parsed rows waiting in staging. Indicator holds are rows blocked until an alias is approved.",
  auto_resolution:
    "Share of column names matched automatically without alias review. Higher is better.",
  review_queue_p50:
    "How long alias review items sit before someone acts. p95 is the slow tail.",
  open_conflicts:
    "Distinct rows where an upload disagrees with a value already stored in analytics. Unique rows still load; charts keep the stored number until you pick a winner in Conflicts.",
  resolution_target: "Long-term goal for automatic indicator matching without human review.",
  cache_hit_rate:
    "Repeated AI prompts served from cache instead of billed API calls. Higher saves money.",
  circuit_breaker:
    "When open, AI calls are paused after too many failures — canonicalization falls back to rules-only matching.",
} as const;

export const STAGE8_TIPS = {
  intro:
    "Scheduled scans for indicator renames, form changes, and duplicate studies. Run manually to refresh candidates; confirm or reject each finding.",
  succession:
    "Detects when one indicator likely replaced another (renamed column or revised DHIS form). Confirm to link history across names.",
  changepoint:
    "Spots a sudden shift in values across most LGAs at once — usually a reporting definition change, not a real outbreak.",
  relations:
    "Finds the same study published under different org names. Confirm links on each dataset's Related Datasets tab.",
  calibration:
    "Tunes how similar two names must be before auto-accept vs send to alias review. Re-run after enough confirmed pairs exist.",
  auto_threshold:
    "Embedding similarity at or above this score auto-accepts a match without review.",
  review_threshold:
    "Scores between review and auto thresholds go to the alias queue for a human decision.",
} as const;

export const QUEUE_TIPS = {
  overview:
    "Platform-wide BullMQ queues processed by background workers — ingestion, publish, notifications, and more.",
  waiting:
    "Jobs accepted but not yet picked up. A large number may mean workers are down or overloaded.",
  failed:
    "Jobs that failed at least once and may retry. Persistent failures move to Dead letter.",
} as const;

export const DEAD_LETTER_TIP =
  "Jobs that failed every retry. Replay sends them back to the queue; discard removes them permanently.";

export const AI_SPEND_TIPS = {
  cost: "Total billed AI usage for canonicalization assist in the selected window.",
  tokens: "Input + output tokens consumed. Spikes often track large or unusual workbooks.",
  acceptance:
    "How often operators accepted AI-suggested indicator matches. Low rates may mean prompts need tuning.",
} as const;

export const ALIASES_TAB_TIP =
  "Upload column names and location strings from datasets that did not match the registry. GIS-only ward/facility mismatches are handled in GIS Reference → Name resolution, not this queue.";

export const COMPARE_TAB_TIP =
  "Pick two datasets to see how similar they are: metadata differences, warehouse overlap and a duplicate verdict. For value-level clashes use the Conflicts tab.";

export const CONFLICTS_TAB_TIP =
  "Each row is one LGA/indicator/period. Every live dataset that reported a different number is listed — pick the winner. Charts keep the current analytics value until you do.";

export const CONFLICTS_STORED_TIP =
  "Stored column — the value already in analytics for that cell. Choosing it keeps that number in charts.";

export const CONFLICTS_UPLOAD_TIP =
  "Limit the table and bulk actions to clashes that involve this upload. Same idea as Period — it only scopes the view. Who wins is the picker below.";

export const CONFLICTS_PERIOD_TIP =
  "Limit the table and bulk actions to one reporting period. Same idea as the upload filter — it only scopes the view. Who wins is the picker below.";

export const CONFLICTS_LOCATION_TIP =
  "Limit the table and bulk actions to one LGA (including its wards and facilities). Same idea as Upload and Period — it only scopes the view.";

export const CONFLICTS_PERIOD_WINNER_TIP =
  "Applies that dataset’s own number to every clash cell it reported in the current filter (upload, period, location, or any mix). Cells it did not report are left unchanged. Each cell keeps its own value — this does not copy one LGA’s number onto others.";

export const CONFLICTS_RESOLVE_TIPS = {
  stored:
    "Keep the value already in analytics. Charts stay as they are for that cell.",
  upload:
    "Use the new file's value. Charts update immediately for that cell.",
} as const;

export const INDICATOR_DETAIL_PAGE_TIP =
  "Canonical disease and metric definitions every upload resolves to. Edits here affect future ingestion — not historical warehouse rows.";

export const INDICATOR_DETAIL_REVISIONS_TIP =
  "Audit trail of name, unit, category, and status changes. Useful when alias or chart labels shift after a registry update.";
