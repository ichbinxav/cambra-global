import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function filesUnder(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(p));
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('P10 — merchant credential boundary', () => {
  it('never reads credential-bearing Integration or StripeConnection entities directly in merchant UI', () => {
    const roots = ['src/pages', 'src/components'].flatMap(filesUnder);
    const offenders = [];
    for (const file of roots) {
      if (file.includes(`${path.sep}admin${path.sep}`)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/base44\.entities\.(Integration|StripeConnection)\.(filter|list|get)\s*\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('projects connection state server-side without returning credential fields', () => {
    const src = fs.readFileSync('base44/functions/getIntegrationStatus/entry.ts', 'utf8');
    expect(src).toContain('connection_id:');
    expect(src).toContain("connection_kind:");
    const projection = src.slice(src.indexOf('return {', src.indexOf('const integrations = catalog.map')),
      src.indexOf('};', src.indexOf('return {', src.indexOf('const integrations = catalog.map'))) + 2);
    expect(projection).not.toMatch(/access_token|refresh_token|metadata_json/);
  });
});
