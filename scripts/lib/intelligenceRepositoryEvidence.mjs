import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { requireFreshAgentTaskInventory } from "./agentTaskInventoryFreshness.mjs";

const P0_PATH = "config/intelligence/orchestration-p0-remediation.v2.json";
const MANIFEST_PATH = "config/intelligence/composition-manifest.v2.json";
const INVENTORY_PATH = "config/agenttask-creator-inventory.json";

const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Text = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`intelligence_repository_evidence_missing:${label}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `intelligence_repository_evidence_json:${label}:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function nonNegativeInteger(counts, field) {
  const value = Number(counts?.[field]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `intelligence_repository_evidence_invalid_count:${field}`,
    );
  }
  return value;
}

export function expectedOtr013Gap(agentTaskCounts) {
  const materialCreators = nonNegativeInteger(
    agentTaskCounts,
    "material_creator_files",
  );
  const terminalAdapted = nonNegativeInteger(
    agentTaskCounts,
    "material_terminal_adapted_files",
  );
  const traceAdapted = nonNegativeInteger(
    agentTaskCounts,
    "material_trace_adapted_files",
  );
  const unresolvedRoutes = nonNegativeInteger(
    agentTaskCounts,
    "unresolved_material_route_files",
  );
  return `Of ${materialCreators} material creator files, ${terminalAdapted} expose canonical terminal adapters and ${traceAdapted} expose the full root/terminal/Event adapter surface; ${unresolvedRoutes} registry-derived material source files remain without that full source-local surface. Static source inventory does not itself prove effect/cost/receipt lineage.`;
}

/**
 * Refreshes only the repository-derived ROOT-OTR-013 assessment. Canonical
 * specification-derived rows remain byte-for-byte unchanged, so this mode does
 * not need or pretend to re-read the external specification set.
 */
export function refreshIntelligenceRepositoryEvidence(root) {
  const inventorySnapshot = requireFreshAgentTaskInventory(root);
  const p0File = path.join(root, P0_PATH);
  const manifestFile = path.join(root, MANIFEST_PATH);
  let inventory;
  try {
    inventory = JSON.parse(inventorySnapshot.canonicalBytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `intelligence_repository_evidence_json:${INVENTORY_PATH}:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const p0 = readJson(p0File, P0_PATH);
  const manifest = readJson(manifestFile, MANIFEST_PATH);

  if (inventory.schema_version !== "agenttask-creator-inventory-v2.0.0") {
    throw new Error("intelligence_repository_evidence_inventory_schema");
  }
  if (p0.schema_version !== "orchestration-p0-remediation-ledger.v2") {
    throw new Error("intelligence_repository_evidence_p0_schema");
  }
  if (manifest.schema_version !== "intelligence-composition-manifest.v2") {
    throw new Error("intelligence_repository_evidence_manifest_schema");
  }
  if (manifest.source_binding?.status !== "PASS") {
    throw new Error("intelligence_repository_evidence_source_binding");
  }

  const currentCompositionBasis = {
    composition_id: manifest.composition_id,
    root_version: manifest.root_version,
    sources: manifest.sources,
    artifacts: manifest.artifacts,
  };
  if (
    manifest.composition_hash !==
      sha256Text(canonicalJson(currentCompositionBasis))
  ) {
    throw new Error("intelligence_repository_evidence_composition_drift");
  }
  for (const receipt of manifest.artifacts || []) {
    const artifactFile = path.join(root, String(receipt?.path || ""));
    if (!receipt?.path || !fs.existsSync(artifactFile)) {
      throw new Error(
        `intelligence_repository_evidence_artifact_missing:${receipt?.path}`,
      );
    }
    if (sha256File(artifactFile) !== receipt.sha256) {
      throw new Error(
        `intelligence_repository_evidence_artifact_drift:${receipt.path}`,
      );
    }
  }

  const matchingRows = (p0.items || []).filter(
    (row) => row?.otr_id === "ROOT-OTR-013",
  );
  if (matchingRows.length !== 1) {
    throw new Error("intelligence_repository_evidence_otr013_cardinality");
  }
  const p0Receipt = (manifest.artifacts || []).find(
    (receipt) => receipt?.path === P0_PATH,
  );
  if (!p0Receipt) {
    throw new Error("intelligence_repository_evidence_p0_receipt_missing");
  }
  const expectedGap = expectedOtr013Gap(inventory.counts);
  const changed = matchingRows[0].gap_local !== expectedGap;
  matchingRows[0].gap_local = expectedGap;

  const p0Content = canonicalJson(p0);
  fs.writeFileSync(p0File, p0Content, "utf8");
  p0Receipt.sha256 = sha256Text(p0Content);
  const nextCompositionBasis = {
    composition_id: manifest.composition_id,
    root_version: manifest.root_version,
    sources: manifest.sources,
    artifacts: manifest.artifacts,
  };
  manifest.composition_hash = sha256Text(canonicalJson(nextCompositionBasis));
  fs.writeFileSync(manifestFile, canonicalJson(manifest), "utf8");

  return {
    changed,
    expected_gap: expectedGap,
    material_creator_files: inventory.counts.material_creator_files,
    material_trace_adapted_files:
      inventory.counts.material_trace_adapted_files,
    unresolved_material_route_files:
      inventory.counts.unresolved_material_route_files,
  };
}
