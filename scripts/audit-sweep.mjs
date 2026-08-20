#!/usr/bin/env node
// AUDIT-TOTAL (2026-08-17) — the reproducible pattern sweep.
//
// This is the technique that found the founderOSData.ts defect (`confidence: 'verified'`
// hardcoded with no check that the read had succeeded), applied to the WHOLE tree rather than
// to the modules that happened to be under the cursor.
//
// It is a sweep, not a linear read. Nobody usefully reads every line of a tree this size; what
// works is knowing the shapes that have already produced real defects here and looking for every
// instance of each.
//
// WHY THIS EXISTS ALONGSIDE harden-silent-failures.mjs: that gate scans ONLY
// base44/functions/**/*.ts and only two shapes, `.catch(() => null|[])` and `catch {}`. It does
// not look at base44/shared/*.ts at all — 210 modules, including the one the original defect was
// in — nor at src/**, nor at the multi-line catch forms, nor at a generic `safe()` helper that
// swallows into a caller-supplied fallback. That is the gap this sweep covers.
//
// Reporting only. It prints findings with file:line and exits 0, because a sweep that fails the
// build on a heuristic teaches people to delete the sweep. Confirmed defects get a real gate.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOTS = ['base44/shared', 'base44/functions', 'src/lib', 'src/pages', 'src/components'];
const SKIP = /node_modules|\.deploy|generated/;
const IS_TEST = /\.(test|spec)\.(js|jsx|ts|tsx)$/;

// `includeTests` matters: the production sweep must NOT count test files, and the R4 sweep needs
// exactly them. Collapsing the two is how the first run of this script reported "0 test files".
function walk(dir, out = [], includeTests = false) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full, out, includeTests);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      if (IS_TEST.test(entry.name) !== includeTests) continue;
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root));
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const findings = { P1: [], P2: [], P3: [], P4: [], P5: [], P6: [], P7: [] };
const add = (bucket, file, line, detail) => findings[bucket].push({ file, line, detail });

// ---------------------------------------------------------------------------
// P1 — a catch that swallows the error and returns an empty/zero value with no trace.
//
// The founderOSData shape was `try { return await fn() } catch { return fallback }`. An empty
// array returned on failure is indistinguishable downstream from an empty array that is the
// truth, so a panel renders "0" for "the read failed".
// ---------------------------------------------------------------------------
const P1_SHAPES = [
  { re: /\.catch\(\s*\(?[^)]*\)?\s*=>\s*(\[\]|null|0|\{\}|\(\{\}\))\s*\)/g, what: 'promise catch returning an empty value' },
  { re: /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(\[\]|null|0|\{\}|undefined)\s*;?\s*\}/g, what: 'catch block returning an empty value' },
  { re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g, what: 'empty catch block' },
  { re: /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+fallback\s*;?\s*\}/g, what: 'catch returning a caller-supplied fallback with no failure record' },
];

// Modules that legitimately swallow because they RECORD the failure first.
const P1_TRACED = /safeBestEffort|readRuntimeSource|safeTracked|recordFailure|reportFailure|degraded|unavailable_sources/;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const traced = P1_TRACED.test(source);
  for (const shape of P1_SHAPES) {
    for (const match of source.matchAll(shape.re)) {
      const line = lineOf(source, match.index);
      // A file that records failures elsewhere still gets reported, but flagged as likely
      // handled — the distinction has to be made by reading, not by the regex.
      add('P1', file, line, `${shape.what}${traced ? ' [file records failures elsewhere — verify this site]' : ' [NO failure recording in this file]'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// P2 — a confidence/verified/status literal that is not derived from whether the read worked.
// ---------------------------------------------------------------------------
const P2_SHAPES = [
  /confidence:\s*['"](?:verified|high|complete)['"]/g,
  /verified:\s*true/g,
  /truth_class:\s*['"]VERIFIED['"]/g,
  /status:\s*['"](?:ok|healthy|complete)['"]/g,
  /data_complete:\s*true/g,
  /measurement_mode:\s*['"]fully_verified['"]/g,
];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const re of P2_SHAPES) {
    for (const match of source.matchAll(re)) {
      const line = lineOf(source, match.index);
      // Context: is there a health/status check within the enclosing 12 lines?
      const lines = source.split('\n');
      const window = lines.slice(Math.max(0, line - 12), line + 4).join('\n');
      const guarded = /health|status|records_read|unavailable|degraded|ok\s*[?:&]|complete|verification_status/i.test(window);
      add('P2', file, line, `${match[0]} ${guarded ? '[a status check is nearby — verify it gates THIS literal]' : '[NO status check nearby]'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// P3 — a coercion that turns "I do not know" into zero before rendering or deciding.
// ---------------------------------------------------------------------------
const P3_SHAPES = [
  { re: /Number\(\s*(?:[a-zA-Z_$][\w$.?[\]']*)\s*\|\|\s*0\s*\)/g, what: 'Number(x || 0) — absent becomes a confident zero' },
  { re: /\|\|\s*0\s*\)/g, what: '|| 0 inside an expression' },
  { re: /Number\.isFinite\(\s*parsed\s*\)\s*\?\s*parsed\s*:\s*null/g, what: 'local re-implementation of the nullable coercion' },
  { re: /parseFloat\([^)]*\)\s*\|\|\s*0/g, what: 'parseFloat(...) || 0' },
  { re: /parseInt\([^)]*\)\s*\|\|\s*0/g, what: 'parseInt(...) || 0' },
];
const MONEY_CONTEXT = /amount|savings|fee|price|cost|revenue|total|rate|quota|minor|invoice|billing/i;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const shape of P3_SHAPES) {
    for (const match of source.matchAll(shape.re)) {
      const line = lineOf(source, match.index);
      const context = lines[line - 1] || '';
      // Only report `|| 0` when it sits on a money-ish or metric-ish name: `|| 0` on an array
      // index or a loop counter is not this defect.
      if (shape.what === '|| 0 inside an expression' && !MONEY_CONTEXT.test(context)) continue;
      add('P3', file, line, `${shape.what} — ${context.trim().slice(0, 100)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// P4 — a test that greps source instead of invoking behaviour (rule R4).
// ---------------------------------------------------------------------------
const uniqueTests = [...new Set(walk('src', [], true))];
for (const file of uniqueTests) {
  const source = fs.readFileSync(file, 'utf8');
  // A source-reading test: it reads a file and asserts on its text.
  const readsSource = /readFileSync\(|read\(['"]/.test(source);
  if (!readsSource) continue;
  const assertions = [...source.matchAll(/expect\(\s*([A-Za-z_$][\w$]*)\s*\)\.(?:toContain|toMatch|not\.toContain|not\.toMatch)\(/g)];
  if (!assertions.length) continue;
  add('P4', file, lineOf(source, assertions[0].index),
    `${assertions.length} source-text assertion(s) — verify each is a structural claim that cannot be driven, not a behaviour that can`);
}

// ---------------------------------------------------------------------------
// P5 — UI text describing a state that has changed.
// ---------------------------------------------------------------------------
const P5_SHAPES = [
  /[Nn]ot built yet/g,
  /[Cc]oming soon/g,
  /chunk C\d/g,
  /[Tt]o be implemented/g,
  /[Pp]laceholder/g,
  /TODO(?!:? *\()/g,
  /[Nn]ot implemented/g,
  /[Ww]ill be available/g,
];
for (const file of files.filter((f) => /^src\//.test(f))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const re of P5_SHAPES) {
    for (const match of source.matchAll(re)) {
      add('P5', file, lineOf(source, match.index), `"${match[0]}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// P6 — a module that is defined and tested but has no production caller.
//
// Dead by disconnection, not by design. campaignExecutionEngine.ts before C6 and the
// CommandReceipt ledger before C6 were both this.
// ---------------------------------------------------------------------------
const sharedModules = walk('base44/shared').filter((f) => /\.ts$/.test(f) && !/generated/.test(f));
const allSource = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
for (const module of sharedModules) {
  const name = path.basename(module, '.ts');
  let productionCallers = 0;
  for (const [file, source] of allSource) {
    if (file === module) continue;
    if (/\.test\./.test(file)) continue;
    if (new RegExp(`from ['"][^'"]*${name}\\.ts['"]`).test(source)
      || new RegExp(`from ['"][^'"]*/${name}['"]`).test(source)) productionCallers += 1;
  }
  if (productionCallers === 0) {
    const hasTest = uniqueTests.some((file) => new RegExp(name).test(fs.readFileSync(file, 'utf8')));
    add('P6', module, 1, `no production importer${hasTest ? ' but IS covered by a test — dead by disconnection' : ' and no test either'}`);
  }
}

// ---------------------------------------------------------------------------
// P7 — spend categories declared versus categories an emergency actually blocks.
//
// CORRECTED after the instrument's own test caught this check being vacuous. The first version
// read the enums on EmergencyControl.jsonc — which declares only TWO enum values, so "0
// categories without blocking code" was checking almost nothing.
//
// The real mechanism is different: EmergencyControl carries BOOLEAN pause flags
// (communications_paused, paid_discovery_paused, …) and costGovernance maps each declared spend
// category onto one of them. So the class check is: every value of CostUsageEvent.category must
// appear in that mapping. The `ai` gap was an instance of exactly this.
// ---------------------------------------------------------------------------
const costEntity = 'base44/entities/CostUsageEvent.jsonc';
const governance = 'base44/shared/costGovernance.ts';
if (fs.existsSync(costEntity) && fs.existsSync(governance)) {
  const entity = JSON.parse(fs.readFileSync(costEntity, 'utf8'));
  const categories = entity.properties?.category?.enum || [];
  const source = fs.readFileSync(governance, 'utf8');
  // The mapping function only: a category listed in a validation array but absent from the
  // capability mapping is precisely the defect.
  const mappingRegion = source.slice(source.indexOf('EmergencyControl capabilities'));
  if (!categories.length) {
    add('P7', costEntity, 1, 'CostUsageEvent.category declares no enum — this check would be vacuous');
  }
  for (const category of categories) {
    if (!new RegExp(`category === ["']${category}["']`).test(mappingRegion)) {
      add('P7', governance, 1, `spend category "${category}" is declared on CostUsageEvent but is not mapped to an emergency capability`);
    }
  }
  const pauseFlags = fs.existsSync('base44/entities/EmergencyControl.jsonc')
    ? Object.keys(JSON.parse(fs.readFileSync('base44/entities/EmergencyControl.jsonc', 'utf8')).properties || {})
      .filter((key) => /_paused$|^safe_mode$/.test(key))
    : [];
  if (pauseFlags.length < 3) {
    add('P7', 'base44/entities/EmergencyControl.jsonc', 1,
      `only ${pauseFlags.length} pause flag(s) found — the check may be looking at the wrong mechanism again`);
  }
}

// ---------------------------------------------------------------------------
const LABELS = {
  P1: 'catch swallowing a failure into an empty value',
  P2: 'hardcoded confidence/verified/status literal',
  P3: 'coercion turning unknown into zero',
  P4: 'test asserting on source text instead of behaviour (R4)',
  P5: 'UI text describing a state that may have changed',
  P6: 'module with no production caller',
  P7: 'spend category with no emergency capability mapping',
};

console.log(`audit-sweep — ${files.length} source files, ${uniqueTests.length} test files\n`);
let total = 0;
for (const key of Object.keys(findings)) {
  const rows = findings[key];
  total += rows.length;
  console.log(`${key} — ${LABELS[key]}: ${rows.length}`);
  const show = process.argv.includes('--all') ? rows : rows.slice(0, 40);
  for (const row of show) console.log(`   ${row.file}:${row.line} — ${row.detail}`);
  if (show.length < rows.length) console.log(`   … ${rows.length - show.length} more (--all to list)`);
  console.log('');
}
console.log(`TOTAL candidate findings: ${total}. These are CANDIDATES: every one needs reading before it is a defect.`);
// Allow piped stdout to drain. process.exit() can truncate the P6/P7 tail under load.
process.exitCode = 0;
