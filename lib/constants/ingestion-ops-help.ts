/** Structured in-app manual for Ingestion Ops — plain language for operators. */

export type IngestionOpsTabId =
  | "observability"
  | "pipeline"
  | "aliases"
  | "conflicts"
  | "indicators"
  | "warehouse"
  | "compare"
  | "ai-spend"
  | "stage8"
  | "queue-health"
  | "dead-letter";

export type IngestionOpsScenario = {
  if: string;
  then: string;
};

export type IngestionOpsStep = {
  title: string;
  detail: string;
};

export type IngestionOpsTabHelp = {
  tabLabel: string;
  tagline: string;
  whatIsThis: string;
  whatYouCanDo: string[];
  steps: IngestionOpsStep[];
  whatHappensNext: string[];
  scenarios: IngestionOpsScenario[];
  tips?: string[];
};

export const INGESTION_JOURNEY_STEPS = [
  {
    title: "Upload & approve",
    detail: "A partner uploads a spreadsheet. Staff approve it for the catalogue when it looks correct.",
  },
  {
    title: "Pipeline (parse)",
    detail: "The system reads the file, matches column names to indicators and places, and saves rows in staging.",
  },
  {
    title: "Aliases",
    detail: "Unfamiliar column or place names wait here until you approve how they map to the master list.",
  },
  {
    title: "Conflicts",
    detail: "If a new number disagrees with one already in analytics, you pick which dataset’s value is truth for that cell.",
  },
  {
    title: "Catalogue publish",
    detail: "The dataset becomes visible on the public portal (download/metadata). This is separate from charts.",
  },
  {
    title: "Warehouse load",
    detail: "Clean staging rows copy into analytics (disease_burden). Public charts read from here.",
  },
] as const;

export const INGESTION_OPS_TAB_HELP: Record<IngestionOpsTabId, IngestionOpsTabHelp> = {
  observability: {
    tabLabel: "Metrics",
    tagline: "Health dashboard for the whole ingestion path",
    whatIsThis:
      "This tab is your at-a-glance scoreboard. It shows whether uploads are parsing well, how many items need human review, whether analytics loads are stuck, and how much AI assist is being used.",
    whatYouCanDo: [
      "See total staging rows and how many are blocked waiting on alias review",
      "Spot open clashes (charts keep the current analytics value until you pick a winner)",
      "Check auto-match rate and alias queue wait times",
      "Monitor AI spend and cache efficiency",
      "Jump to Pipeline, Aliases, or Conflicts when a number looks wrong",
    ],
    steps: [
      {
        title: "Start here each morning",
        detail: "Scan the headline cards. Red or rising numbers usually mean Pipeline, Aliases, or Conflicts need attention.",
      },
      {
        title: "Follow the worst number",
        detail: "Open conflicts → Conflicts tab. Pending aliases → Aliases tab. Failed/stuck jobs → Pipeline tab.",
      },
      {
        title: "Confirm warehouse is moving",
        detail: "Check how many datasets are ready vs loading vs already in analytics (warehouse section of metrics).",
      },
    ],
    whatHappensNext: [
      "Fixing pipeline or alias issues unblocks warehouse load; clashes do not — unique rows still load",
      "Metrics refresh as jobs complete — give workers a minute after you act",
    ],
    scenarios: [
      {
        if: "Open conflicts is high",
        then: "Go to Conflicts and pick a winner per cell or for a period/upload/location slice. Unique rows already load; only the clashing cells wait.",
      },
      {
        if: "Auto-resolution rate dropped suddenly",
        then: "New or messy column names — expect more work in Aliases and possibly higher AI spend.",
      },
      {
        if: "Review queue p95 is very high",
        then: "Aliases are sitting too long. Clearing the alias queue unblocks pipeline completion.",
      },
    ],
    tips: [
      "Metrics show platform-wide totals — use Pipeline or a dataset page for one-file detail.",
    ],
  },

  pipeline: {
    tabLabel: "Pipeline",
    tagline: "Step 1 — turn spreadsheets into clean staging rows",
    whatIsThis:
      "When a dataset is approved, background workers parse the workbook: match indicators, resolve locations, validate values, and write rows to staging. Nothing reaches public charts until later steps succeed.",
    whatYouCanDo: [
      "See which datasets are running, queued, failed, or never started",
      "Open a dataset's ingestion page for error detail",
      "Retry catch-up for datasets that stalled (super admin backfill on the page header)",
      "Know when *not* to load analytics yet (failures or missing steps here)",
    ],
    steps: [
      {
        title: "Find datasets needing attention",
        detail: "Use the Needs attention view — failed jobs, stuck jobs, or approved files that never ingested.",
      },
      {
        title: "Open the dataset ingestion page",
        detail: "Read the error message or fitness report. Common fixes: wrong layout, bad dates, missing org units.",
      },
      {
        title: "Fix and re-run",
        detail: "Re-upload or trigger catch-up after fixing the file or registry gaps. Wait until status shows processed.",
      },
      {
        title: "Clear aliases if prompted",
        detail: "Pipeline may finish with pending aliases — those must be approved in the Aliases tab before analytics load.",
      },
    ],
    whatHappensNext: [
      "Successful pipeline → rows sit in staging with matched indicators",
      "Pending aliases → ingestion pauses until Aliases tab is cleared",
      "New clashes with existing analytics → Conflicts tab; unique rows still load to Warehouse",
      "When aliases are clear → dataset can load to Warehouse",
    ],
    scenarios: [
      {
        if: "Job status is Failed",
        then: "Open the dataset, read the error, fix the source file or mapping, then retry ingestion.",
      },
      {
        if: "Job is stuck with no progress",
        then: "Check the Queues tab (are workers running?). If not, contact the platform team, then retry.",
      },
      {
        if: "Approved but never started",
        then: "Use Backfill catch-up (super admin) or open the dataset and queue ingestion manually.",
      },
    ],
  },

  aliases: {
    tabLabel: "Aliases",
    tagline: "Step 1b — teach the system unfamiliar names",
    whatIsThis:
      "Uploads use many different spellings for the same indicator or place. When the system is not confident, items land here for a human yes/no: link to an existing registry entry or treat as something new.",
    whatYouCanDo: [
      "Approve a suggested match (links upload text to the canonical indicator or org unit)",
      "Reject or correct a bad suggestion",
      "Work the global queue or filter by dataset",
      "On Auto-matched: mark rows to accept, then Accept selected",
      "Clear the backlog so pipeline can finish and warehouse load can proceed",
    ],
    steps: [
      {
        title: "Sort by oldest or by dataset",
        detail: "Tackle one upload at a time if conflicts and aliases relate to the same file.",
      },
      {
        title: "Read the raw text vs suggested match",
        detail: "Ask: is this the same metric/place we already use? If yes, approve. If it is a new metric, reject and create/activate the indicator.",
      },
      {
        title: "Auto-matched tab",
        detail: "Mark the engine guesses you agree with, then Accept selected. Remap or Not an indicator are separate row actions and do not use the ticks.",
      },
      {
        title: "Return to Pipeline or Warehouse",
        detail: "When pending count hits zero for that dataset, analytics load can proceed. Clashes do not block the rest of the file.",
      },
    ],
    whatHappensNext: [
      "Approved alias → staging rows resolve to the canonical indicator/org unit",
      "Rejected alias → may create a review item for a new indicator or mark as non-indicator",
      "Zero pending aliases → auto warehouse load may trigger if catalogue is published",
    ],
    scenarios: [
      {
        if: "Same typo appears on many uploads",
        then: "Approve once — future uploads with that text auto-match.",
      },
      {
        if: "AI suggestion looks wrong",
        then: "Reject and pick the correct registry entry manually — do not approve uncertain matches.",
      },
      {
        if: "Aliases clear but warehouse still blocked",
        then: "Clashing cells also appear in Conflicts — unique rows still load.",
      },
    ],
  },

  conflicts: {
    tabLabel: "Conflicts",
    tagline: "Pick which dataset’s number is truth when sources disagree",
    whatIsThis:
      "Each row is one place, one indicator, and one period. Every live dataset that reported a different number is listed. Charts keep the current analytics value until you pick a winner. Unique rows from new files still load — this queue is only for clashing cells.",
    whatYouCanDo: [
      "Filter by upload, period (e.g. 2023 Q4), and/or location (LGA)",
      "Resolve one cell with Use this on any listed dataset (current analytics shows Keeping this)",
      "Pick a winner for the current filter — that dataset’s own number wins on every clash cell it reported; cells it did not report stay unchanged",
      "With an upload selected: bulk Use stored column or Use upload column for the filtered rows",
      "See stale resolutions when a winning dataset was later archived or retracted",
    ],
    steps: [
      {
        title: "Narrow the queue",
        detail: "Upload, Period, and Location only scope the view and bulk actions. They do not pick a winner by themselves.",
      },
      {
        title: "Pick a winner for the slice (optional)",
        detail: "When any filter is on, the winner picker lists datasets that reported in that view. Choose one and click Use as winner. Each cell keeps that dataset’s own value — this does not copy one LGA’s number onto others.",
      },
      {
        title: "Or pick per cell",
        detail: "Each row lists every dataset that reported that cell. Current analytics is marked. Click Use this on the number that should win.",
      },
      {
        title: "Stored / Upload column (upload selected)",
        detail: "Use stored column keeps the values already in analytics. Use upload column prefers that file’s values. Both respect the period and location filters.",
      },
    ],
    whatHappensNext: [
      "Use this / Use as winner → that cell’s analytics value updates immediately to the chosen dataset’s number",
      "Use stored column → charts stay as they are for those cells",
      "Use upload column → charts update to that file’s numbers for those cells",
      "Retract the winner → the other live source’s value returns to charts",
      "Archive or retract a participant → open clashes close; leftover warehouse rows fall back to the other live source",
    ],
    scenarios: [
      {
        if: "New DHIS file should win last quarter",
        then: "Filter to that period, choose the DHIS dataset in the winner picker, then Use as winner.",
      },
      {
        if: "One LGA’s upload looks wrong",
        then: "Filter to that location and Use stored column, or Use this on the trusted dataset per cell.",
      },
      {
        if: "Stale resolved banner appears",
        then: "Audit only — winning dataset was archived/retracted; charts no longer use that resolution.",
      },
    ],
  },

  indicators: {
    tabLabel: "Indicators",
    tagline: "Master list of diseases and metrics",
    whatIsThis:
      "Every column in every upload eventually maps to an indicator here (e.g. presumptive TB, malaria cases). Active indicators appear in analytics filters. Inactive ones were proposed during ingestion and need staff activation.",
    whatYouCanDo: [
      "Browse and search the registry",
      "Activate indicators that should appear in public charts",
      "Archive or deactivate duplicates and mistakes",
      "Understand what uploads are trying to match against",
    ],
    steps: [
      {
        title: "Search for the metric name",
        detail: "Use plain language or slug — check for an existing entry before creating duplicates.",
      },
      {
        title: "Activate when ready for production",
        detail: "Inactive indicators can hold staging rows until you activate them.",
      },
      {
        title: "Link aliases to the right indicator",
        detail: "When aliases reference a new name, confirm whether it maps here or needs a new entry.",
      },
    ],
    whatHappensNext: [
      "Active indicator → burden rows and charts can reference it",
      "Duplicate indicators → split history — merge via alias links and Stage 8 succession when applicable",
    ],
    scenarios: [
      {
        if: "Upload column cannot be matched",
        then: "Fix in Aliases first; activate a new indicator only when it is a genuinely new metric.",
      },
      {
        if: "Indicator renamed in DHIS",
        then: "Use Stage 8 succession to link old and new names across time.",
      },
    ],
  },

  warehouse: {
    tabLabel: "Warehouse",
    tagline: "Step 2 — copy clean rows into analytics for charts",
    whatIsThis:
      "Staging holds parsed rows. The warehouse (disease_burden) is what the public portal charts read. Loading analytics copies resolved staging into the warehouse. Retract removes a dataset's rows from charts without deleting the catalogue file.",
    whatYouCanDo: [
      "See datasets ready to load, loading now, already live, or failed",
      "Start or retry analytics load for a dataset",
      "Retract a dataset from analytics (MFA may be required)",
      "Filter by development partner or phase",
    ],
    steps: [
      {
        title: "Confirm prerequisites",
        detail: "Pipeline finished, aliases clear, dataset published to catalogue. Clashes do not block load.",
      },
      {
        title: "Load when status is Ready",
        detail: "Click load on the dataset row or use the dataset detail analytics strip.",
      },
      {
        title: "Wait for the worker",
        detail: "Loading runs in the background — refresh after a minute. Large files take longer.",
      },
      {
        title: "Verify on the dataset page",
        detail: "Analytics loaded timestamp updates; portal charts pick up new values after cache refresh.",
      },
    ],
    whatHappensNext: [
      "Successful load → rows visible in public analytics and maps (live sources only)",
      "Partial updates → only new/changed staging rows copy on subsequent loads",
      "Retract → rows removed from charts; open conflicts involving that dataset close",
    ],
    scenarios: [
      {
        if: "Warehouse shows clashes under a loaded dataset",
        then: "Open Conflicts and pick a winner. Charts already show the current analytics number for those cells.",
      },
      {
        if: "Load failed",
        then: "Read error on dataset page, fix root cause, retry load.",
      },
      {
        if: "Dataset archived while in analytics",
        then: "Archive dialog requires retract — warehouse rows must be removed explicitly.",
      },
    ],
  },

  compare: {
    tabLabel: "Compare",
    tagline: "Check two datasets side by side",
    whatIsThis:
      "Pick two datasets and see how many rows they share, where values differ, and overlap coverage. Portal view matches what public charts use. Raw warehouse mode includes retracted or archived sources for investigation.",
    whatYouCanDo: [
      "Compare two approved datasets",
      "Switch between portal view and raw warehouse view",
      "Spot value mismatches on shared keys",
      "Estimate coverage overlap before merging or deprecating a source",
    ],
    steps: [
      {
        title: "Choose dataset A and B",
        detail: "Usually an older official source vs a newer upload.",
      },
      {
        title: "Leave portal view on for chart parity",
        detail: "Turn on raw warehouse only when investigating retracted or archived data.",
      },
      {
        title: "Click Compare",
        detail: "Review shared keys, conflict count, and completeness percentages.",
      },
      {
        title: "Drill down in Conflicts if needed",
        detail: "High conflict count here → resolve in Conflicts tab for the newer upload.",
      },
    ],
    whatHappensNext: [
      "Compare is read-only — it does not change data",
      "Use results to decide which dataset should win those cells in Conflicts",
    ],
    scenarios: [
      {
        if: "Many shared keys but high conflicts",
        then: "Resolve conflicts for the newer dataset — numbers disagree on the same cells.",
      },
      {
        if: "Portal view shows zero keys for archived dataset",
        then: "Expected — switch to raw warehouse to see historical rows.",
      },
    ],
  },

  "ai-spend": {
    tabLabel: "AI spend",
    tagline: "Cost and quality of AI-assisted name matching",
    whatIsThis:
      "During pipeline, AI can suggest which registry indicator matches a messy column name. This tab shows how much that costs, how often suggestions are accepted, and whether the system is using cached answers to save money.",
    whatYouCanDo: [
      "Monitor spend over the last 7 days (or configured window)",
      "See token volume and acceptance rate",
      "Detect when AI is over-used because uploads are unusually messy",
    ],
    steps: [
      {
        title: "Check spend after large batch uploads",
        detail: "Spikes often mean many new column names hit the system at once.",
      },
      {
        title: "Review acceptance rate",
        detail: "Very low acceptance → operators reject AI guesses — aliases may need manual work instead.",
      },
      {
        title: "Act on aliases, not AI settings",
        detail: "Approving good aliases reduces future AI calls via cache and rules.",
      },
    ],
    whatHappensNext: [
      "Higher cache hit rate → lower cost on repeat uploads",
      "Circuit breaker open (see Metrics) → AI paused; rules-only matching until recovery",
    ],
    scenarios: [
      {
        if: "Spend jumped but uploads did not",
        then: "Check for unusual workbooks or disabled cache — review Metrics circuit breaker.",
      },
      {
        if: "Acceptance rate very low",
        then: "Focus on Aliases quality; consider Stage 8 calibration (super admin).",
      },
    ],
  },

  stage8: {
    tabLabel: "Stage 8",
    tagline: "Advanced data-quality scans (super admin)",
    whatIsThis:
      "Long-running checks for renamed indicators, sudden reporting changes across all LGAs, duplicate studies under different org names, and tuning how aggressively the system auto-accepts name matches.",
    whatYouCanDo: [
      "Run succession, changepoint, and relation scans manually",
      "Confirm or reject candidate links",
      "Re-run embedding calibration after enough confirmed pairs",
    ],
    steps: [
      {
        title: "Run scans after major DHIS form changes",
        detail: "Succession finds renamed indicators; changepoint finds definition shifts.",
      },
      {
        title: "Review candidates carefully",
        detail: "Confirm only when evidence is strong — links affect historical continuity.",
      },
      {
        title: "Run calibration periodically",
        detail: "Adjusts auto-accept vs send-to-review thresholds.",
      },
    ],
    whatHappensNext: [
      "Confirmed succession → indicator history linked across names",
      "Confirmed relations → datasets linked on Related Datasets tabs",
    ],
    scenarios: [
      {
        if: "Sudden spike in all LGAs at once",
        then: "Run changepoint scan — often a form definition change, not an outbreak.",
      },
      {
        if: "Same study under two org names",
        then: "Confirm relation so compare and governance treat them as related.",
      },
    ],
    tips: ["Day-to-day operators rarely need this tab — use Metrics, Aliases, Conflicts, Warehouse first."],
  },

  "queue-health": {
    tabLabel: "Queues",
    tagline: "Background workers and job backlogs (super admin)",
    whatIsThis:
      "Ingestion, warehouse load, email, and other tasks run in queues processed by workers. This tab shows waiting, active, and failed job counts — not the same as a single upload failing validation.",
    whatYouCanDo: [
      "See if workers are keeping up (waiting jobs should stay low)",
      "Spot degraded queue health",
      "Know when to ask the platform team to restart background processing",
    ],
    steps: [
      {
        title: "Check overall status",
        detail: "Healthy = workers processing. Degraded = backlog or failures building.",
      },
      {
        title: "Find the busy queue",
        detail: "upload-processing and publish queues matter most for ingestion ops.",
      },
      {
        title: "Ask for a restart if waiting grows",
        detail: "Ask the platform team to restart background processing.",
      },
    ],
    whatHappensNext: [
      "Workers resume → pipeline and warehouse jobs drain from waiting to active to done",
      "Persistent failures → jobs may move to Dead letter tab",
    ],
    scenarios: [
      {
        if: "Warehouse stuck on loading forever",
        then: "Check publish queue here — worker may be down.",
      },
      {
        if: "Many failed but few waiting",
        then: "Jobs retry automatically; check Dead letter if failures persist.",
      },
    ],
  },

  "dead-letter": {
    tabLabel: "Dead letter",
    tagline: "Jobs that failed every retry (super admin)",
    whatIsThis:
      "When a background job fails too many times, it lands here. The upload or load did not finish — you fix the root cause, then replay. Discard only if the job is obsolete.",
    whatYouCanDo: [
      "Inspect failed job payload and error reason",
      "Replay after fixing the underlying issue",
      "Discard jobs that should never run again",
    ],
    steps: [
      {
        title: "Read the failed reason",
        detail: "Often points to DB timeout, missing file, or code error after deploy.",
      },
      {
        title: "Fix the root cause",
        detail: "Re-upload file, clear aliases, resolve conflicts, or ask the platform team to restart background processing.",
      },
      {
        title: "Replay the job",
        detail: "Sends it back to the queue once — monitor Pipeline or Warehouse for completion.",
      },
    ],
    whatHappensNext: [
      "Successful replay → job completes normally and disappears from dead letter",
      "Replay without fix → job fails again",
    ],
    scenarios: [
      {
        if: "Same job replays and fails twice",
        then: "Do not loop — read stack trace, fix data or code, then replay once.",
      },
      {
        if: "Job for deleted dataset",
        then: "Discard — nothing to process.",
      },
    ],
  },
};

export const INGESTION_OPS_TAB_ORDER: IngestionOpsTabId[] = [
  "observability",
  "pipeline",
  "aliases",
  "conflicts",
  "indicators",
  "warehouse",
  "compare",
  "ai-spend",
  "stage8",
  "queue-health",
  "dead-letter",
];

export function getIngestionOpsTabHelp(tab: string): IngestionOpsTabHelp | null {
  if (tab in INGESTION_OPS_TAB_HELP) {
    return INGESTION_OPS_TAB_HELP[tab as IngestionOpsTabId];
  }
  return null;
}
