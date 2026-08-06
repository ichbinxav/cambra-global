#!/usr/bin/env node
// v62.1 CP6.2 — release:check: validates RELEASE.json against the live repo.
// Fails on: version mismatch, wrong releaseName, policy drift, stale lockfile
// SHA, SDK mismatch, non-payments-only scope, Stripe claimed live.
import fs from "node:fs";
import crypto from "node:crypto";

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let failed = false;
const fail = (msg) => { console.error(`release:check FAIL — ${msg}`); failed = true; };

if (!fs.existsSync("RELEASE.json")) {
  console.error("release:check FAIL — RELEASE.json missing. Run: npm run release:manifest");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync("RELEASE.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const policy = JSON.parse(fs.readFileSync("config/product-policy.json", "utf8"));

if (manifest.version !== pkg.version) fail(`version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`);
if (manifest.releaseName !== pkg.releaseName) fail(`releaseName mismatch: "${manifest.releaseName}"`);
if (manifest.policyVersion !== policy.policyVersion) fail(`policy drift: manifest ${manifest.policyVersion} vs live ${policy.policyVersion}`);
if (manifest.policyFileSha !== sha256("config/product-policy.json")) fail("stale manifest: config/product-policy.json changed since generation");
if (manifest.lockfileSha !== sha256("package-lock.json")) fail("stale manifest: package-lock.json changed since generation");
if (manifest.canonicalSdkVersion !== pkg.dependencies["@base44/sdk"]) fail("SDK version mismatch vs package.json");

const enabled = Object.entries(policy.productScope).filter(([, v]) => v.productionEnabled).map(([k]) => k);
if (enabled.length !== 1 || enabled[0] !== "payments") fail(`product scope is not payments-only: [${enabled.join(", ")}]`);
if (JSON.stringify(manifest.productScope) !== JSON.stringify(["payments"])) fail("manifest productScope is not payments-only");
if (/^live/i.test(String(manifest.stripeIntegrationStatus)) || manifest.stripeIntegrationStatus === "live") fail("Stripe must not be declared live");
if (manifest.stripeIntegrationStatus !== policy.integrationStatus.stripe) fail("Stripe integration status drift vs policy");

if (failed) process.exit(1);
console.log(`release:check PASS — ${manifest.releaseName} (${manifest.version}) coherent with repo state.`);