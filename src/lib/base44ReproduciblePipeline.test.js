import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertReleaseBundleIdentity,
  BASE44_BUNDLE_HASH_ALGORITHM,
  BASE44_FUNCTIONS_DIR,
  inspectBase44Bundle,
} from "../../scripts/lib/base44Bundle.mjs";
import {
  collectSourceTreeEntries,
  computeSourceTreeHash,
  hashEntries,
} from "../../scripts/lib/sourceTreeHash.mjs";
import { collectReleasePayloadPaths } from "../../scripts/lib/releasePayload.mjs";

const REPO_ROOT = process.cwd();
const BUNDLE_SCRIPT = "scripts/build-base44-functions.mjs";
let cleanRoot;
let zipRoot;
let cleanSourceIdentity;
let firstIdentity;
let secondIdentity;
let extractedIdentity;
let extractedRebuiltIdentity;

function copyCleanBundleInputs(targetRoot) {
  const sourceEntries = collectSourceTreeEntries(REPO_ROOT);
  for (const entry of sourceEntries) {
    const source = path.join(REPO_ROOT, entry.path);
    const target = path.join(targetRoot, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  cleanSourceIdentity = {
    algorithm: "sha256-tree-v1",
    hash: hashEntries(sourceEntries),
    fileCount: sourceEntries.length,
  };
}

function buildBundle(root) {
  return spawnSync(process.execPath, [BUNDLE_SCRIPT], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function asReleaseIdentity(identity) {
  return {
    backendDeploymentTopologySha: identity.topology_sha256,
    backendBundleManifestSha: identity.manifest_sha256,
    backendBundle: {
      physicalFunctionCount: identity.physical_function_count,
      logicalRouteCount: identity.logical_route_count,
      stagedFileCount: identity.staged_file_count,
      stagedTreeSha256: identity.staged_tree_sha256,
      hashAlgorithm: identity.hash_algorithm,
      functionsDir: identity.functions_dir,
      configSha256: identity.config_sha256,
    },
  };
}

beforeAll(() => {
  cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-base44-clean-"));
  copyCleanBundleInputs(cleanRoot);
  expect(fs.existsSync(path.join(cleanRoot, "base44", ".deploy"))).toBe(false);
  expect(computeSourceTreeHash(cleanRoot)).toEqual(cleanSourceIdentity);

  const firstBuild = buildBundle(cleanRoot);
  expect(firstBuild.status, firstBuild.stderr || firstBuild.stdout).toBe(0);
  firstIdentity = inspectBase44Bundle(cleanRoot);

  const secondBuild = buildBundle(cleanRoot);
  expect(secondBuild.status, secondBuild.stderr || secondBuild.stdout).toBe(0);
  secondIdentity = inspectBase44Bundle(cleanRoot);

  zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-base44-zip-"));
  const archivePath = path.join(zipRoot, "clean-source-and-bundle.zip");
  const payloadPaths = collectReleasePayloadPaths(cleanRoot);
  const zipped = spawnSync("zip", ["-q", "-X", "-9", archivePath, "-@"], {
    cwd: cleanRoot,
    input: `${payloadPaths.join("\n")}\n`,
    encoding: "utf8",
  });
  expect(zipped.status, zipped.stderr || zipped.stdout).toBe(0);
  const extractedRoot = path.join(zipRoot, "extracted");
  fs.mkdirSync(extractedRoot);
  const unzipped = spawnSync("unzip", ["-q", archivePath, "-d", extractedRoot], { encoding: "utf8" });
  expect(unzipped.status, unzipped.stderr || unzipped.stdout).toBe(0);
  expect(computeSourceTreeHash(extractedRoot)).toEqual(cleanSourceIdentity);
  extractedIdentity = inspectBase44Bundle(extractedRoot);
  const extractedBuild = buildBundle(extractedRoot);
  expect(extractedBuild.status, extractedBuild.stderr || extractedBuild.stdout).toBe(0);
  extractedRebuiltIdentity = inspectBase44Bundle(extractedRoot);
}, 120_000);

afterAll(() => {
  if (cleanRoot) fs.rmSync(cleanRoot, { recursive: true, force: true });
  if (zipRoot) fs.rmSync(zipRoot, { recursive: true, force: true });
});

describe("reproducible Base44 physical bundle pipeline", () => {
  // DPA-1 (2026-08-16) — logical routes deliberately 27 -> 28.
  // CAMP-C5 (2026-08-16) — 28 -> 29 for conversationAdmin. Physical stays 276:
  // a logical route adds an action to an already deployed entry point.
  // COMMAND-C2 (2026-08-17) — 29 -> 30 for commandConversationAdmin.
  // COMMAND-C6 (2026-08-17) — 30 -> 31 for commandRunAdmin.
  // COMMAND-C7 (2026-08-17) — 31 -> 32 for commandRunWorker.
  // DASHBOARD-C3 (2026-08-17) — 32 -> 33 for pipelineWorkspaceAdmin.
  it("rebuilds a clean source checkout into the exact 276 physical / 33 logical topology", () => {
    expect(firstIdentity).toMatchObject({
      schema_version: "cambra-base44-function-bundle-v2",
      functions_dir: BASE44_FUNCTIONS_DIR,
      physical_function_count: 276,
      logical_route_count: 33,
      hash_algorithm: BASE44_BUNDLE_HASH_ALGORITHM,
      escaped_relative_import_count: 0,
      unresolved_relative_import_count: 0,
    });
    expect(secondIdentity).toEqual(firstIdentity);
    expect(firstIdentity.staged_file_count).toBeGreaterThan(276 * 2);
    expect(firstIdentity.staged_tree_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(firstIdentity.topology_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(firstIdentity.config_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(firstIdentity.manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed on bundle or topology tampering", () => {
    const stagedFile = path.join(cleanRoot, "base44", ".deploy", "functions", firstIdentity.physical_functions[0], "entry.ts");
    const stagedBytes = fs.readFileSync(stagedFile);
    fs.appendFileSync(stagedFile, "\n");
    expect(() => inspectBase44Bundle(cleanRoot)).toThrow("base44_bundle_tree_hash_mismatch");
    fs.writeFileSync(stagedFile, stagedBytes);
    expect(inspectBase44Bundle(cleanRoot)).toEqual(firstIdentity);

    const topologyPath = path.join(cleanRoot, "base44", "deployment-topology.json");
    const topologyBytes = fs.readFileSync(topologyPath);
    fs.appendFileSync(topologyPath, "\n");
    expect(() => inspectBase44Bundle(cleanRoot)).toThrow("base44_bundle_topology_hash_mismatch");
    fs.writeFileSync(topologyPath, topologyBytes);
    expect(inspectBase44Bundle(cleanRoot)).toEqual(firstIdentity);

    const unboundPath = path.join(cleanRoot, "base44", ".deploy", "unbound.txt");
    fs.writeFileSync(unboundPath, "must not ship\n");
    expect(() => inspectBase44Bundle(cleanRoot)).toThrow("base44_bundle_unexpected_deploy_entries");
    fs.unlinkSync(unboundPath);
    expect(inspectBase44Bundle(cleanRoot)).toEqual(firstIdentity);
  });

  it("binds release metadata to the independently recomputed bundle identity", () => {
    const releaseIdentity = asReleaseIdentity(firstIdentity);
    expect(assertReleaseBundleIdentity(releaseIdentity, firstIdentity)).toBe(true);
    releaseIdentity.backendBundle.stagedTreeSha256 = "0".repeat(64);
    expect(() => assertReleaseBundleIdentity(releaseIdentity, firstIdentity)).toThrow("bundle_tree_sha_mismatch");
  });

  it("forces prebundle before deploy without an implicit CLI download", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    const packageLock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package-lock.json"), "utf8"));
    const base44Config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "base44", "config.jsonc"), "utf8"));
    expect(base44Config).toMatchObject({
      functionsDir: BASE44_FUNCTIONS_DIR,
      site: {
        installCommand: "npm ci",
        buildCommand: "npm run base44:functions:bundle && npm run build",
      },
    });
    expect(packageJson.scripts["base44:functions:deploy"]).toBe(
      "npm run base44:functions:bundle && npx --no-install base44 functions deploy --force",
    );
    expect(packageJson.devDependencies.base44).toBe("0.1.5");
    expect(packageLock.packages[""].devDependencies.base44).toBe("0.1.5");
    expect(packageLock.packages["node_modules/base44"].version).toBe("0.1.5");
    expect(packageJson.scripts["base44:functions:deploy"]).not.toContain("@latest");
    expect(packageJson.scripts["base44:site:deploy"]).toBe(
      "npm run base44:functions:bundle && npx --no-install base44 site deploy -y",
    );
    expect(packageJson.scripts["base44:runtime:smoke"]).toContain("npx --no-install base44");
  });

  it("packages, re-extracts, verifies, and rebuilds the included bundle", () => {
    const payloadSource = fs.readFileSync(path.join(REPO_ROOT, "scripts", "lib", "releasePayload.mjs"), "utf8");
    const packagerSource = fs.readFileSync(path.join(REPO_ROOT, "scripts", "package-release.mjs"), "utf8");
    expect(payloadSource).toContain('RELEASE_GENERATED_DIRS = ["base44/.deploy"]');
    expect(packagerSource).toContain('spawnSync("unzip"');
    expect(packagerSource).toContain("inspectBase44Bundle(extractedRoot)");
    expect(packagerSource).toContain('["scripts/build-base44-functions.mjs"]');
    expect(packagerSource).toContain("reextracted_backend_bundle_rebuild_match: true");
    expect(extractedIdentity).toEqual(firstIdentity);
    expect(extractedRebuiltIdentity).toEqual(firstIdentity);
  });

  it("preserves the complete generated bundle as a CI artifact", () => {
    const canonicalWorkflow = fs.readFileSync(path.join(REPO_ROOT, "ci", "github-workflow-ci.yml"), "utf8");
    const installedWorkflow = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
    expect(installedWorkflow).toBe(canonicalWorkflow);
    expect(canonicalWorkflow).toContain("base44/.deploy/");
    expect(canonicalWorkflow).not.toContain("base44/.deploy/manifest.json");
  });

  it("documents source handlers separately from deployment units", () => {
    const readmes = ["README.md", path.join("src", "README.md")]
      .map((relative) => fs.readFileSync(path.join(REPO_ROOT, relative), "utf8"));
    const topologyDoc = fs.readFileSync(path.join(REPO_ROOT, "src", "docs", "BASE44_BACKEND_DEPLOYMENT_TOPOLOGY.md"), "utf8");
    const productionFunctions = fs.readFileSync(path.join(REPO_ROOT, "src", "docs", "PRODUCTION_FUNCTIONS.md"), "utf8");
    for (const document of [...readmes, topologyDoc, productionFunctions]) {
      expect(document).toContain("300");
      expect(document).toContain("276");
      expect(document).toContain("27");
    }
    for (const readme of readmes) {
      expect(readme).not.toContain("Function code under `base44/functions/**` is auto-discovered");
    }
    expect(productionFunctions).not.toContain("300 funciones desplegables");
  });
});
