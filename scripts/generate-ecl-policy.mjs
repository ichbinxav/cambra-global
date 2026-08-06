#!/usr/bin/env node
// scripts/generate-ecl-policy.mjs
//
// v62.4 — ECL P2 policy + domain artifact generator.
//
//   node scripts/generate-ecl-policy.mjs           # generate (writes artifacts)
//   node scripts/generate-ecl-policy.mjs --check    # check drift (no writes)
//
// Reads ONLY config/ecl-policy.json, validates it against the Zod schema, and
// emits deterministic artifacts:
//   · src/lib/generated/eclPolicy.js          (frontend policy)
//   · base44/shared/generated/eclPolicy.ts    (backend policy — byte-identical)
//   · base44/shared/generated/eclDomain.ts    (backend domain, generated from
//                                              the canonical src/lib modules)
//
// Exits non-zero on validation failure or (in --check mode) on drift.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  validateEclPolicy,
  buildEclPolicyArtifact,
  buildEclDomainArtifact,
  DOMAIN_SOURCE_ORDER,
} from "../src/lib/eclPolicySchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const JSON_PATH = join(root, "config", "ecl-policy.json");
const POLICY_TARGETS = [
  join(root, "src", "lib", "generated", "eclPolicy.js"),
  join(root, "base44", "shared", "generated", "eclPolicy.ts"),
];
const DOMAIN_TARGET = join(root, "base44", "shared", "generated", "eclDomain.ts");

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
    return validateEclPolicy(parsed);
  } catch (e) {
    console.error(`✖ ${JSON_PATH} failed schema validation:`);
    if (e.issues) {
      for (const issue of e.issues) console.error(`  · ${issue.path.join(".") || "<root>"}: ${issue.message}`);
    } else {
      console.error(`  ${e.message}`);
    }
    process.exit(1);
  }
}

function readDomainSources() {
  const sources = {};
  for (const rel of DOMAIN_SOURCE_ORDER) sources[rel] = readFileSync(join(root, rel), "utf-8");
  return sources;
}

function main() {
  const check = process.argv.includes("--check");
  const policy = readPolicy();
  const policyText = buildEclPolicyArtifact(policy);
  const domainText = buildEclDomainArtifact(readDomainSources());
  const plan = [...POLICY_TARGETS.map((t) => [t, policyText]), [DOMAIN_TARGET, domainText]];

  if (check) {
    let drift = false;
    for (const [target, expected] of plan) {
      if (!existsSync(target)) {
        console.error(`✖ missing artifact: ${target} (run: npm run ecl:generate)`);
        drift = true;
        continue;
      }
      if (readFileSync(target, "utf-8") !== expected) {
        console.error(`✖ drift detected in ${target}`);
        drift = true;
      }
    }
    if (drift) {
      console.error("  Run `npm run ecl:generate` to regenerate, then re-check.");
      process.exit(1);
    }
    console.log("✓ ecl:check — artifacts in sync with config/ecl-policy.json");
    console.log(`  policyVersion=${policy.policyVersion} effectiveDate=${policy.effectiveDate} gates=${Object.keys(policy.gates).length}`);
    return;
  }

  for (const [target, text] of plan) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf-8");
    console.log(`✓ wrote ${target.replace(root + "/", "")}`);
  }
  console.log(`  policyVersion=${policy.policyVersion} effectiveDate=${policy.effectiveDate} gates=${Object.keys(policy.gates).length}`);
}

main();