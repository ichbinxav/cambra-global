#!/usr/bin/env node
// v62.1 CP6.2 — generates RELEASE.json from the actual repo state.
// Never invents a git SHA (null unless CI provides one). Test totals come from
// .test-results.json (written by CI or a local run) — absent means the tests
// were NOT executed for this manifest and the field is null, not faked.
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const policy = JSON.parse(fs.readFileSync("config/product-policy.json", "utf8"));

const templates = fs.readFileSync("base44/shared/recoverContractTemplates.ts", "utf8");
const tvMatch = templates.match(/RECOVER_CONTRACT_TEMPLATE_VERSION\s*=\s*["']([^"']+)["']/);

let gitSha = process.env.GITHUB_SHA || null;
if (!gitSha) {
  try { gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); } catch { gitSha = null; }
}

let npmVersion = null;
try { npmVersion = execSync("npm --version", { encoding: "utf8" }).trim(); } catch { /* not available */ }

let testResults = null;
if (fs.existsSync(".test-results.json")) {
  testResults = JSON.parse(fs.readFileSync(".test-results.json", "utf8"));
}

const manifest = {
  releaseName: pkg.releaseName,
  version: pkg.version,
  gitSha,
  releaseBuild: Boolean(process.env.CI),
  ciRunId: process.env.GITHUB_RUN_ID || null,
  sourceArchiveSha: process.env.SOURCE_ARCHIVE_SHA || null,
  policyVersion: policy.policyVersion,
  policySchemaVersion: policy.schemaVersion,
  templateVersions: tvMatch ? [tvMatch[1]] : [],
  productScope: Object.entries(policy.productScope)
    .filter(([, v]) => v.productionEnabled)
    .map(([k]) => k),
  stripeIntegrationStatus: policy.integrationStatus.stripe,
  canonicalSdkVersion: pkg.dependencies["@base44/sdk"],
  node: process.version,
  npm: npmVersion,
  lockfileSha: sha256("package-lock.json"),
  policyFileSha: sha256("config/product-policy.json"),
  frozenSchemas: JSON.parse(fs.readFileSync("config/frozen-schemas.json", "utf8")).sha256,
  tests: testResults, // { testFiles, passed, failed, skipped } or null = not executed
  buildIdentifier: `cambra-${pkg.version}${gitSha ? `-${gitSha.slice(0, 8)}` : ""}`,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync("RELEASE.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`RELEASE.json written for ${manifest.releaseName} (${manifest.version}).`);