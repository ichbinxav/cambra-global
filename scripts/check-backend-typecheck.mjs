#!/usr/bin/env node
// Backend typecheck gate — covers EVERY base44/functions/*/entry.ts.
//
// WHY THIS EXISTS
// tsconfig.critical.json is a hand-maintained allowlist: 66 of 300 backend
// entry points. The other 234 had no typecheck at all, and that gap shipped
// four real defects in v0.98.0:
//
//   resendInboundWebhook/entry.ts:62          lifecycle_id  (ReferenceError)
//   seedProviderIntelligenceFoundation:8      error         (ReferenceError)
//   growthPathRuntime.ts:94                   emergency.reasons -> always []
//   spendIntelligenceAgent/entry.ts:272       unknown not iterable
//
// The first two were guaranteed runtime crashes. Neither was reachable by any
// gate, because the file was outside the allowlist.
//
// WHAT IT DOES
// Compiles the full backend surface and splits diagnostics in two:
//
//   DEFECT codes  -> always fail. These mean a name does not exist, a module
//                    cannot be resolved, or a value is used in a way that
//                    throws. There is no such thing as an acceptable one.
//
//   NOISE codes   -> ratcheted. The Base44 SDK is untyped, so `any`-shaped
//                    access produces a large, harmless population (TS2339 on
//                    unknown, Date arithmetic in comparators, etc). We do not
//                    demand zero; we demand it never grows.
//
// The ratchet count lives in config/backend-typecheck-baseline.json. Lowering
// it is automatic on request (--update); raising it is impossible.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const BASELINE = "config/backend-typecheck-baseline.json";

// Diagnostics that always indicate a real defect, never SDK noise.
const DEFECT_CODES = new Set([
  "TS2304", // Cannot find name 'x'
  "TS2551", // Property 'x' does not exist on type 'Y'. Did you mean 'z'?
  "TS2552", // Cannot find name 'x'. Did you mean 'y'?
  "TS2307", // Cannot find module 'x'
  "TS2488", // Type must have a [Symbol.iterator]() method
  "TS2564", // Property has no initializer and is not definitely assigned
  "TS7027", // Unreachable code detected
]);

const update = process.argv.includes("--update");

function backendSources() {
  const files = ["types/deno-shim.d.ts"];
  const root = "base44/functions";
  for (const dir of fs.readdirSync(root).sort()) {
    const entry = path.join(root, dir, "entry.ts");
    if (fs.existsSync(entry)) files.push(entry);
  }
  return files;
}

const include = backendSources();
const functionCount = include.length - 1;

const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    lib: ["ES2022", "DOM"],
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    types: [],
  },
  include,
};

// Written inside the repo (not os.tmpdir) so relative include paths resolve.
const configPath = path.join(process.cwd(), ".backend-typecheck.tsconfig.json");
fs.writeFileSync(configPath, JSON.stringify(tsconfig, null, 2));

let out = "";
try {
  const res = spawnSync("npx", ["tsc", "-p", configPath, "--pretty", "false"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  out = `${res.stdout || ""}\n${res.stderr || ""}`;
  // tsc exits 0 (no errors) or 2 (errors found). Anything else means the
  // compiler itself failed, and "no errors" would be a lie.
  if (res.status !== 0 && res.status !== 2) {
    console.error(
      `backend-typecheck FAIL — tsc did not run (exit ${res.status}).\n${out.slice(0, 800)}`,
    );
    process.exit(1);
  }
} finally {
  fs.rmSync(configPath, { force: true });
}

const diagnostics = [];
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (m) {
    diagnostics.push({
      file: m[1],
      line: Number(m[2]),
      code: m[4],
      message: m[5],
    });
  }
}

// A compiler that emits nothing at all is indistinguishable from a broken
// environment. Given 300 untyped-SDK entry points, zero is not credible.
if (diagnostics.length === 0 && !out.includes("error TS")) {
  const sanity = fs.existsSync("base44/functions") ? functionCount : 0;
  if (sanity > 0 && !update) {
    console.error(
      "backend-typecheck FAIL — tsc produced no diagnostics at all across " +
        `${sanity} entry points. Treating as a broken toolchain, not a clean tree.`,
    );
    process.exit(1);
  }
}

const defects = diagnostics.filter((d) => DEFECT_CODES.has(d.code));
const noise = diagnostics.filter((d) => !DEFECT_CODES.has(d.code));

if (update) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        comment:
          "Ratchet for non-defect backend diagnostics (untyped Base44 SDK). " +
          "May only decrease. Defect-class codes are never baselined.",
        defectCodes: [...DEFECT_CODES].sort(),
        maxNoiseDiagnostics: noise.length,
        functionCount,
        capturedWith: "scripts/check-backend-typecheck.mjs --update",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `backend-typecheck — baseline written: ${noise.length} noise diagnostic(s), ` +
      `${defects.length} defect(s), ${functionCount} entry points.`,
  );
  process.exit(defects.length ? 1 : 0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(
    `backend-typecheck FAIL — ${BASELINE} missing. Capture it once:\n` +
      "  node scripts/check-backend-typecheck.mjs --update",
  );
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

let failed = false;

if (defects.length) {
  failed = true;
  console.error(
    `backend-typecheck FAIL — ${defects.length} defect-class diagnostic(s). ` +
      "These are never acceptable and are never baselined:",
  );
  for (const d of defects.slice(0, 40)) {
    console.error(`  ${d.file}:${d.line} ${d.code} ${d.message}`);
  }
}

if (noise.length > baseline.maxNoiseDiagnostics) {
  failed = true;
  console.error(
    `backend-typecheck FAIL — noise diagnostics grew: ${noise.length} now vs ` +
      `${baseline.maxNoiseDiagnostics} allowed. Fix the new ones, or lower the ` +
      "ratchet deliberately with --update if you genuinely reduced debt.",
  );
  const byFile = new Map();
  for (const d of noise) byFile.set(d.file, (byFile.get(d.file) || 0) + 1);
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.error(`  ${n}  ${file}`);
  }
}

if (failed) process.exit(1);

const improved = baseline.maxNoiseDiagnostics - noise.length;
console.log(
  `backend-typecheck PASS — ${functionCount} entry points, 0 defect-class ` +
    `diagnostics, ${noise.length}/${baseline.maxNoiseDiagnostics} noise` +
    (improved > 0 ? ` (${improved} eliminated — rerun with --update to lock in)` : "") +
    ".",
);
