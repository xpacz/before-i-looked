import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/index.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last status and error', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const fixtures = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(fixtures).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    const backup = rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row with a null owner and the offset of the log times', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render')!;
    expect(row.owner).toBeNull();
    expect(row.firstAt).toBe('2026-10-29T05:41:09+01:00');
  });

  it('counts log lines per status', () => {
    expect(readNight('runs', '2026-10-28')!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('returns null for a night with no file or a bad night name', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../rig')).toBeNull();
  });

  it('renders an empty file as zero rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });
});
