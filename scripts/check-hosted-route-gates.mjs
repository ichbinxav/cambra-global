#!/usr/bin/env node
// AUDIT SEC-01 (2026-08-17) — every hosted route inside a guardedScheduledServe handler must gate
// itself before it takes service-role authority.
//
// WHY THIS CLASS EXISTS. guardedScheduledServe is, by design:
//
//     if (invocationKind(req) !== 'SCHEDULED') return handler(req);
//
// A non-scheduled request goes STRAIGHT to the handler with no authentication, because the
// contract is that each hosted route authenticates itself. Three of the four routes on
// maintenanceEngine honour that. The fourth — command_run_sweep, added in COMMAND-C7 — did not: it
// called createClientFromRequest(req).asServiceRole and ran the sweep, and the file's
// requireAdminOrInternal sat further down and was never reached.
//
// An unauthenticated POST therefore advanced founder CommandRuns and spent CAMBRA's model keys.
//
// The ordering is invisible when a handler is one 200-column line, which is why this is a gate and
// not a comment.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootFlag = process.argv.indexOf('--root');
if (rootFlag !== -1 && !process.argv[rootFlag + 1]) {
  console.error('hosted-route-gates:check FAIL — --root requires a directory');
  process.exit(1);
}
const sourceRoot = rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1]);
const sourcePath = (...parts) => path.join(sourceRoot, ...parts);

let failures = 0;
const fail = (m) => { console.error(`hosted-route-gates:check FAIL — ${m}`); failures += 1; };

const GATES = /requireAdminOrInternal|requireAdmin\b|requireInternal\b|assertAdmin/;
const SERVICE_ROLE = /asServiceRole/;

/**
 * Strips comments before the ordering check.
 *
 * The first run of this gate failed on the very fix it was written to protect: the explanatory
 * comment above the new gate call mentions `asServiceRole`, so the regex found the privileged
 * client at an earlier offset than the gate and reported the ordering as still wrong. This is the
 * sixth time in this programme a check has been satisfied — or broken — by prose about the check.
 * Positions must be measured on code.
 *
 * Newlines are preserved so offsets stay comparable to the original text.
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .split('\n').map((line) => line.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');

const dirs = fs.readdirSync(sourcePath('base44', 'functions'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);

let hosts = 0;
let branches = 0;
for (const name of dirs) {
  const relativeFile = path.join('base44/functions', name, 'entry.ts');
  const file = sourcePath(relativeFile);
  if (!fs.existsSync(file)) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  if (!source.includes('guardedScheduledServe')) continue;
  hosts += 1;

  // Each hosted route is a `routed.host_action === '<key>'` branch. Take the text from the branch
  // test to the next branch test (or end of file) and require a gate before any asServiceRole.
  const tests = [...source.matchAll(/host_action\s*===\s*['"]([a-z0-9_]+)['"]/g)];
  for (let index = 0; index < tests.length; index += 1) {
    branches += 1;
    const start = tests[index].index;
    const end = index + 1 < tests.length ? tests[index + 1].index : source.length;
    const region = source.slice(start, end);

    const serviceAt = region.search(SERVICE_ROLE);
    if (serviceAt === -1) continue; // no privileged client in this branch

    // A branch that delegates to another function's handler is gated THERE, which is the pattern
    // the safe siblings use. Accept it, but only when the delegation is the whole branch body.
    const delegates = /return\s*\(?await\s+handle[A-Z]/.test(region);
    if (delegates) continue;

    const gateAt = region.search(GATES);
    if (gateAt === -1) {
      fail(`${relativeFile}: hosted route "${tests[index][1]}" takes asServiceRole with NO gate in its branch — guardedScheduledServe passes unauthenticated requests straight through`);
    } else if (gateAt > serviceAt) {
      fail(`${relativeFile}: hosted route "${tests[index][1]}" takes asServiceRole BEFORE its gate (service role at +${serviceAt}, gate at +${gateAt}) — the gate is unreachable for an unauthenticated caller`);
    }
  }
}

// The premise this gate rests on. If guardedScheduledServe ever starts authenticating
// non-scheduled requests itself, this check is protecting something that no longer needs it and
// should be re-derived rather than left in place claiming a protection it does not provide.
const scheduler = stripComments(fs.readFileSync(sourcePath('base44', 'shared', 'schedulerRun.ts'), 'utf8'));
if (!/invocationKind\(req\)\s*!==\s*'SCHEDULED'\)\s*return\s+handler\(req\)/.test(scheduler)) {
  fail('schedulerRun.ts no longer passes non-scheduled requests straight to the handler — re-derive this gate against the new contract');
}

if (failures) process.exit(1);
console.log(
  `hosted-route-gates:check PASS — ${hosts} host function(s), ${branches} hosted route branch(es); ` +
  'every branch that takes service-role authority gates itself first, and guardedScheduledServe ' +
  'still passes non-scheduled requests through unauthenticated (which is why the gate is needed)',
);
