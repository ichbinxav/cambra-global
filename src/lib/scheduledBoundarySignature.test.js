import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

describe('scheduled function boundary signatures', () => {
  it('always supplies the Base44 client factory to guardedScheduledServe', () => {
    const root = path.resolve('base44/functions');
    const malformed = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(root, entry.name, 'function.jsonc');
      if (!fs.existsSync(configPath)) continue;
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!(config.automations || []).some((row) => row.type === 'scheduled' && row.is_active === true)) continue;
      const source = fs.readFileSync(path.join(root, entry.name, config.entry || 'entry.ts'), 'utf8');
      if (
        source.includes('guardedScheduledServe') &&
        !/guardedScheduledServe\s*\(\s*\{[\s\S]*?\}\s*,\s*createClientFromRequest\s*,/.test(source)
      ) malformed.push(entry.name);
    }
    expect(malformed).toEqual([]);
  });

  it('does not consume the request body before a scheduler claim can clone it', () => {
    const unsafe = [];
    for (const root of ['base44/functions', 'base44/shared']) {
      const pending = [path.resolve(root)];
      while (pending.length) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const filePath = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            pending.push(filePath);
            continue;
          }
          if (!entry.name.endsWith('.ts')) continue;
          const source = fs.readFileSync(filePath, 'utf8');
          if (
            source.includes('claimSchedulerRun(') &&
            /await\s+req\.json\s*\(/.test(source)
          ) unsafe.push(path.relative(process.cwd(), filePath));
        }
      }
    }
    expect(unsafe).toEqual([]);
  });
});