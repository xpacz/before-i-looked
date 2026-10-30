import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// runs/ is read-only: every case here writes into a temp runs dir.
function appWith(files: Record<string, string>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [night, body] of Object.entries(files)) writeFileSync(join(runsDir, `${night}.jsonl`), body);
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

const line = (o: object) => JSON.stringify(o) + '\n';
const good =
  line({ at: '2026-10-29T01:00:00+01:00', job: 'b/job', status: 'ok', owner: 'rook' }) +
  line({ at: '2026-10-29T01:30:00+01:00', job: 'a/job', status: 'fail', owner: null, error: 'boom' });

describe('GET /digest/:night', () => {
  it('200: renders rows sorted by job, marks fail, shows — for a null owner', async () => {
    const res = await appWith({ '2026-10-29': good }).request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('a/job')).toBeLessThan(html.indexOf('b/job'));
    expect(html).toContain('boom');
    expect(html).toContain('class="warn"');
    expect(html).toContain('—');
  });

  it('404: a night with no file', async () => {
    const res = await appWith({}).request('/digest/2026-10-29');
    expect(res.status).toBe(404);
  });

  it('empty night renders "nothing ran"', async () => {
    const res = await appWith({ '2026-10-29': '' }).request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a bad line is counted and the night still renders', async () => {
    const res = await appWith({ '2026-10-29': good + '{"at":"2026-10-29T02:00:00+01:00","job":"lane/sy' }).request(
      '/digest/2026-10-29',
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 log line(s) could not be read');
  });

  it('marks 3 or more retries', async () => {
    const retries = [1, 2, 3].map((m) => line({ at: `2026-10-29T01:0${m}:00+01:00`, job: 'x', status: 'retry', owner: 'rook' }));
    const res = await appWith({ '2026-10-29': retries.join('') }).request('/digest/2026-10-29');
    expect(await res.text()).toContain('3 retries');
  });
});

describe('GET /api/digest/:night', () => {
  it('200: same jobs, in the same order, as the page', async () => {
    const app = appWith({ '2026-10-29': good });
    const json = (await (await app.request('/api/digest/2026-10-29')).json()) as { rows: { job: string }[] };
    const html = await (await app.request('/digest/2026-10-29')).text();
    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual(['a/job', 'b/job']);
    expect(jobs.map((j) => html.indexOf(j))).toEqual([...jobs.map((j) => html.indexOf(j))].sort((a, b) => a - b));
  });

  it('404: a night with no file', async () => {
    expect((await appWith({}).request('/api/digest/2026-10-29')).status).toBe(404);
  });

  it('empty night: no rows', async () => {
    const res = await appWith({ '2026-10-29': '' }).request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rows: unknown[] }).rows).toEqual([]);
  });

  it('bad line: counted in the JSON', async () => {
    const res = await appWith({ '2026-10-29': good + 'not json' }).request('/api/digest/2026-10-29');
    expect(((await res.json()) as { badLines: number }).badLines).toBe(1);
  });
});

describe('status board links', () => {
  it('links each night to its digest with counts', async () => {
    const html = await (await appWith({ '2026-10-29': good }).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-29"');
    expect(html).toContain('ok 1');
    expect(html).toContain('fail');
  });
});
