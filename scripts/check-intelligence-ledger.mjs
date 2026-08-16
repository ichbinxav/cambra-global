#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configDir = path.join(root, "config", "intelligence");
const fail = (message) => {
  throw new Error(`intelligence_ledger_invalid:${message}`);
};
const read = (name) => {
  const file = path.join(configDir, name);
  if (!fs.existsSync(file)) fail(`missing_file:${name}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`json_parse:${name}:${error instanceof Error ? error.message : String(error)}`);
  }
};
const existsRef = (ref) => typeof ref === "string" && ref.length > 0 && fs.existsSync(path.join(root, ref));
const unique = (values, label) => {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate_${label}:${value}`);
    seen.add(value);
  }
  return seen;
};
const range = (count) => Array.from({ length: count }, (_, index) => `S${String(index).padStart(2, "0")}`);
const expectedSections = {
  CIV2: [...range(31), "APPENDIX_A", "APPENDIX_B", "APPENDIX_C", "APPENDIX_D", "APPENDIX_E", "FINAL"],
  ORCH: range(38),
  CPIC: [...range(54), "APPENDIX_A", "APPENDIX_B"],
  ALI: [...range(40), "APPENDIX_A", "APPENDIX_B", "APPENDIX_C", "APPENDIX_D", "APPENDIX_E", "FINAL"],
};
const expectedSources = {
  CIV2: ["CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md", "48f781020c8893a439c84743703152d337e5a917348297dbb015a5bf448905c6", 4859],
  ORCH: ["CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPEC.md", "4cdaa0daded4576eb297fd752f4b09aeb44830db28ebe7ab96a4511c61eafb06", 1299],
  CPIC: ["CAMBRA_CPIC_ULTRA_MASTER_SPEC.md", "3d4f178a0092ad798be7a874e15571e1b40352ead9a417ddc4e0c1afa771e086", 429],
  ALI: ["CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md", "78236a93e571ce6aa4ec095294df91e8e1c1a51f43c266cf99ff944823157d4f", 5989],
};
const capabilityStates = new Set(["EXISTING", "PARTIAL", "TARGET"]);
const deliveryStatuses = new Set(["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "VERIFIED", "BLOCKED", "DEFERRED", "SUPERSEDED"]);
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const ledger = read("requirement-ledger.v1.json");
const compatibility = read("spec-compatibility-matrix.v1.json");
const reuse = read("resource-reuse-matrix.v1.json");
const contracts = read("shared-contract-map.v1.json");
const gates = read("gates.v1.json");

if (ledger.schema_version !== "intelligence-requirement-ledger.v1") fail("ledger_schema_version");
if (compatibility.schema_version !== "spec-compatibility-matrix.v1") fail("compatibility_schema_version");
if (reuse.schema_version !== "resource-reuse-matrix.v1") fail("reuse_schema_version");
if (contracts.schema_version !== "shared-contract-map.v1") fail("contracts_schema_version");
if (gates.schema_version !== "intelligence-gates.v1") fail("gates_schema_version");

for (const [namespace, [filename, hash, lineCount]] of Object.entries(expectedSources)) {
  const source = ledger.source_specs?.[namespace];
  if (!source) fail(`source_missing:${namespace}`);
  if (source.filename !== filename || source.sha256 !== hash || source.line_count !== lineCount) {
    fail(`source_identity_mismatch:${namespace}`);
  }
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail(`source_hash_invalid:${namespace}`);
}
const specDir = process.env.CAMBRA_INTELLIGENCE_SPEC_DIR;
if (specDir) {
  for (const [namespace, [filename, expectedHash]] of Object.entries(expectedSources)) {
    const file = path.join(specDir, filename);
    if (!fs.existsSync(file)) fail(`external_spec_missing:${namespace}:${file}`);
    if (sha256(file) !== expectedHash) fail(`external_spec_hash_mismatch:${namespace}`);
  }
}

if (ledger.audit_baseline?.working_tree?.clean !== false) fail("baseline_must_record_dirty_tree");
if (ledger.audit_baseline?.runtime_parity !== "UNVERIFIED") fail("baseline_runtime_must_remain_unverified");
if (ledger.audit_baseline?.production_runtime !== "UNVERIFIED") fail("baseline_production_must_remain_unverified");
if (ledger.audit_baseline?.release?.final_verdict !== "NOT_GO_READY") fail("baseline_release_verdict_mismatch");
if (ledger.audit_baseline?.release?.production_seal_eligible !== false) fail("baseline_must_not_be_seal_eligible");

if (!Array.isArray(ledger.requirements)) fail("requirements_not_array");
const requirementIds = unique(ledger.requirements.map((entry) => entry.requirement_id), "requirement_id");
for (const [namespace, sections] of Object.entries(expectedSections)) {
  const actual = ledger.requirements.filter((entry) => entry.spec === namespace).map((entry) => entry.section);
  const actualSet = unique(actual, `${namespace}_section`);
  for (const section of sections) {
    if (!actualSet.has(section)) fail(`section_missing:${namespace}.${section}`);
  }
  if (actual.length !== sections.length) fail(`section_count:${namespace}:${actual.length}:${sections.length}`);
  if (ledger.requirement_counts?.[namespace] !== sections.length) fail(`declared_section_count:${namespace}`);
}
for (const entry of ledger.requirements) {
  for (const field of ["requirement_id", "spec", "section", "title", "requirement_summary", "owner", "notes"]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") fail(`requirement_field:${entry.requirement_id}:${field}`);
  }
  if (!new RegExp(`^${entry.spec}\\.`).test(entry.requirement_id)) fail(`requirement_namespace:${entry.requirement_id}`);
  if (!capabilityStates.has(entry.capability_state)) fail(`capability_state:${entry.requirement_id}`);
  if (!deliveryStatuses.has(entry.delivery_status)) fail(`delivery_status:${entry.requirement_id}`);
  for (const list of ["implementation_refs", "test_refs", "runtime_evidence", "dependencies", "blockers"]) {
    if (!Array.isArray(entry[list])) fail(`requirement_list:${entry.requirement_id}:${list}`);
  }
  for (const ref of [...entry.implementation_refs, ...entry.test_refs]) {
    if (!existsRef(ref)) fail(`missing_repo_ref:${entry.requirement_id}:${ref}`);
  }
  for (const dependency of entry.dependencies) {
    if (!requirementIds.has(dependency)) fail(`missing_dependency:${entry.requirement_id}:${dependency}`);
  }
  if (entry.delivery_status === "VERIFIED" && entry.runtime_evidence.length === 0) {
    fail(`verified_without_runtime_evidence:${entry.requirement_id}`);
  }
  if (entry.capability_state === "TARGET" && entry.delivery_status === "VERIFIED") {
    fail(`target_marked_verified:${entry.requirement_id}`);
  }
}

if (!Array.isArray(compatibility.conflicts) || compatibility.conflicts.length < 15) fail("compatibility_coverage");
unique(compatibility.conflicts.map((entry) => entry.compatibility_id), "compatibility_id");
for (const entry of compatibility.conflicts) {
  if (entry.decision_status !== "RESOLVED") fail(`compatibility_unresolved:${entry.compatibility_id}`);
  if (typeof entry.resolution !== "string" || entry.resolution.length < 30) fail(`compatibility_resolution:${entry.compatibility_id}`);
  for (const list of ["civ2_sections", "orchestration_sections", "cpic_sections", "adaptive_lead_sections", "implementation_refs", "runtime_evidence", "blockers"]) {
    if (!Array.isArray(entry[list])) fail(`compatibility_list:${entry.compatibility_id}:${list}`);
  }
  for (const sectionRef of [...entry.civ2_sections, ...entry.orchestration_sections, ...entry.cpic_sections, ...entry.adaptive_lead_sections]) {
    if (!requirementIds.has(sectionRef)) fail(`compatibility_requirement_ref:${entry.compatibility_id}:${sectionRef}`);
  }
  for (const ref of entry.implementation_refs) if (!existsRef(ref)) fail(`compatibility_repo_ref:${entry.compatibility_id}:${ref}`);
  if (entry.delivery_status === "VERIFIED" && entry.runtime_evidence.length === 0) fail(`compatibility_verified_without_runtime:${entry.compatibility_id}`);
}

if (!Array.isArray(reuse.resources) || reuse.resources.length < 45) fail("reuse_coverage");
unique(reuse.resources.map((entry) => entry.resource_id), "resource_id");
for (const entry of reuse.resources) {
  if (!capabilityStates.has(entry.capability_state)) fail(`reuse_capability_state:${entry.resource_id}`);
  if (!deliveryStatuses.has(entry.delivery_status)) fail(`reuse_delivery_status:${entry.resource_id}`);
  if (!reuse.allowed_decisions.includes(entry.decision)) fail(`reuse_decision:${entry.resource_id}`);
  if (!Array.isArray(entry.evidence_refs) || !Array.isArray(entry.runtime_evidence) || !Array.isArray(entry.qualifiers)) fail(`reuse_lists:${entry.resource_id}`);
  for (const ref of entry.evidence_refs) if (!existsRef(ref)) fail(`reuse_repo_ref:${entry.resource_id}:${ref}`);
  if (entry.delivery_status === "VERIFIED" && entry.runtime_evidence.length === 0) fail(`reuse_verified_without_runtime:${entry.resource_id}`);
}

const requiredContracts = ["Identity", "Time", "Evidence", "Decision", "Execution", "Outcome", "Learning", "Model"];
if (JSON.stringify(contracts.required_contracts) !== JSON.stringify(requiredContracts)) fail("required_contract_declaration");
const contractNames = unique(contracts.contracts.map((entry) => entry.name), "contract_name");
for (const name of requiredContracts) if (!contractNames.has(name)) fail(`contract_missing:${name}`);
for (const entry of contracts.contracts) {
  if (!capabilityStates.has(entry.capability_state) || !deliveryStatuses.has(entry.delivery_status)) fail(`contract_status:${entry.contract_id}`);
  for (const list of ["authority_resources", "canonical_keys", "adapters", "invariants", "gaps", "test_refs", "runtime_evidence", "blockers"]) {
    if (!Array.isArray(entry[list])) fail(`contract_list:${entry.contract_id}:${list}`);
  }
  for (const ref of [...entry.authority_resources, ...entry.test_refs]) if (!existsRef(ref)) fail(`contract_repo_ref:${entry.contract_id}:${ref}`);
  if (entry.delivery_status === "VERIFIED" && entry.runtime_evidence.length === 0) fail(`contract_verified_without_runtime:${entry.contract_id}`);
}

if (gates.global_state === "VERIFIED") fail("global_state_false_green");
if (!Array.isArray(gates.gates) || gates.gates.length < 15) fail("gate_coverage");
unique(gates.gates.map((entry) => entry.gate_id), "gate_id");
for (const entry of gates.gates) {
  if (!capabilityStates.has(entry.capability_state) || !deliveryStatuses.has(entry.delivery_status)) fail(`gate_status:${entry.gate_id}`);
  for (const list of ["requirement_refs", "evidence_refs", "runtime_evidence", "blockers"]) {
    if (!Array.isArray(entry[list])) fail(`gate_list:${entry.gate_id}:${list}`);
  }
  for (const ref of entry.requirement_refs) if (!requirementIds.has(ref)) fail(`gate_requirement_ref:${entry.gate_id}:${ref}`);
  for (const ref of entry.evidence_refs) if (!existsRef(ref)) fail(`gate_repo_ref:${entry.gate_id}:${ref}`);
  if (entry.gate_status === "PASSED" && entry.runtime_evidence.length === 0) fail(`gate_passed_without_runtime:${entry.gate_id}`);
  if (entry.gate_status === "PASSED" && entry.blockers.length > 0) fail(`gate_passed_with_blockers:${entry.gate_id}`);
}

const verifiedRequirements = ledger.requirements.filter((entry) => entry.delivery_status === "VERIFIED").length;
const passedGates = gates.gates.filter((entry) => entry.gate_status === "PASSED").length;
console.log(
  `intelligence-ledger:check PASS — ${ledger.requirements.length} requirements · ${compatibility.conflicts.length} compatibility decisions · ${reuse.resources.length} resources · ${contracts.contracts.length} shared contracts · ${gates.gates.length} gates · ${verifiedRequirements} runtime-verified requirements · ${passedGates} passed gates`,
);

