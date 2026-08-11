import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function sourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(abs);
    }
  };
  walk(root);
  return files;
}

describe('production sender identity', () => {
  it('contains no hardcoded personal operator mailbox in Base44 runtime source', () => {
    const matches = sourceFiles('base44').filter((file) => fs.readFileSync(file, 'utf8').includes('xavi@cambra.global'));
    expect(matches).toEqual([]);
  });
});
