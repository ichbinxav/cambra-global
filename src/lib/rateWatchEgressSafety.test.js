import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('P3 rate-watch public egress boundary', () => {
  it('resolves and revalidates every configured source and redirect through the public HTTPS gate', () => {
    const source = fs.readFileSync('base44/functions/rateIntelligenceWatchWorker/entry.ts', 'utf8');
    expect(source).toContain("import { fetchPublicHttps } from '../../shared/publicHttpEgress.ts'");
    expect(source).toContain('fetchPublicHttps(w.source_url');
    expect(source).toContain('{maxRedirects:4}');
    expect(source).not.toContain("fetch(w.source_url,{redirect:'follow'");
  });

  it('does not turn source/read/persistence failures into a completed scheduled run', () => {
    const source = fs.readFileSync('base44/functions/rateIntelligenceWatchWorker/entry.ts', 'utf8');
    expect(source).toContain("requireCriticalOperation('rate_watch_due_targets'");
    expect(source).toContain("requireCriticalOperation('rate_watch_mark_failure'");
    expect(source).toContain("status:failed?'failed':'completed'");
    expect(source).toContain("status:503");
  });
});
