import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const statuses = new Set<string>(['ok', 'retry', 'fail']);

// Parse one log line at the edge; null means the line is bad.
function parseLine(text: string): Line | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (typeof o.status !== 'string' || !statuses.has(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' && o.owner !== '' ? o.owner : null,
    error: typeof o.error === 'string' && o.error !== '' ? o.error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  for (const entry of text.split('\n')) {
    if (entry.trim() === '') continue;
    const line = parseLine(entry);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = rows.get(line.job);
    if (!row) {
      rows.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (Date.parse(line.at) < Date.parse(row.firstAt)) row.firstAt = line.at;
    // Ties go to the later line: the log is append-only.
    if (Date.parse(line.at) >= Date.parse(row.lastAt)) {
      row.lastAt = line.at;
      row.lastStatus = line.status;
      if (line.owner) row.owner = line.owner;
    }
    if (line.error) row.lastError = line.error;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows: sorted, badLines, counts };
  return result;
};
