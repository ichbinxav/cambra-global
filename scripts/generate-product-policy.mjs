// scripts/generate-product-policy.mjs
//
// v60 — Central Product Policy generator.
//
//   node scripts/generate-product-policy.mjs           # generate (writes artifacts)
//   node scripts/generate-product-policy.mjs --check    # check drift (no writes)
//
// Reads ONLY config/product-policy.json, validates it against the Zod schema,
// and emits deterministic, byte-identical artifacts for the frontend and the
// backend. The two files share one source of truth and one text body, so
// frontend and backend can never diverge silently.
//
// Exits non-zero on validation failure or (in --check mode) on drift.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductPolicy, buildArtifacts } from "../src/lib/productPolicySchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const JSON_PATH = join(root, "config", "product-policy.json");
const FRONTEND_OUT = join(root, "src", "lib", "generated", "productPolicy.js");
const BACKEND_OUT = join(root, "base44", "shared", "generated", "productPolicy.ts");

const TARGETS = [FRONTEND_OUT, BACKEND_OUT];

function readPolicy() {
  const raw = readFileSync(JSON_PATH, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`✖ ${JSON_PATH} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  try {
    return validateProductPolicy(parsed);
  } catch (e) {
    console.error(`✖ ${JSON_PATH} failed schema validation:`);
    if (e.issues) {
      for (const issue of e.issues) {
        console.error(`  · ${issue.path.join(".") || "<root>"}: ${issue.message}`);
      }
    } else {
      console.error(`  ${e.message}`);
    }
    process.exit(1);
  }
}

function main() {
  const check = process.argv.includes("--check");
  const policy = readPolicy();
  const text = buildArtifacts(policy);

  if (check) {
    let drift = false;
    for (const target of TARGETS) {
      if (!existsSync(target)) {
        console.error(`✖ missing artifact: ${target} (run: npm run policy:generate)`);
        drift = true;
        continue;
      }
      const current = readFileSync(target, "utf-8");
      if (current !== text) {
        console.error(`✖ drift detected in ${target}`);
        drift = true;
      }
    }
    if (drift) {
      console.error("  Run `npm run policy:generate` to regenerate, then re-check.");
      process.exit(1);
    }
    console.log("✓ policy:check — artifacts in sync with config/product-policy.json");
    console.log(`  policyVersion=${policy.policyVersion} effectiveDate=${policy.effectiveDate}`);
    return;
  }

  // Generate mode — write both artifacts.
  for (const target of TARGETS) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf-8");
    const rel = target.replace(root + "/", "");
    console.log(`✓ wrote ${rel}`);
  }
  console.log(`  policyVersion=${policy.policyVersion} effectiveDate=${policy.effectiveDate}`);
}

main();