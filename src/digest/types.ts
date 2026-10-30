// What the morning digest shows: one row per job in a night's run log (plan.md § 1).
export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // null when the log line has no owner; views render it as —
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  // As written in the log, offset kept (never converted to UTC).
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that did not parse. Counted, never thrown.
  badLines: number;
  // Log lines per status across all jobs.
  counts: Record<RunStatus, number>;
};

// Reads runs/<night>.jsonl. Returns null when the night has no file.
export type ReadNight = (runsDir: string, night: string) => Night | null;
