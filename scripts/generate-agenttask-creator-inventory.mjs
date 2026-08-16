import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = path.join(ROOT, 'base44', 'functions');
const OUTPUT = path.join(ROOT, 'config', 'agenttask-creator-inventory.json');
const MATERIAL_REGISTRY = path.join(
  ROOT,
  'config',
  'remediation',
  'material-boundary-registry.v1.json',
);
const CHECK = process.argv.includes('--check');

const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
const count = (source, expression) => [...source.matchAll(expression)].length;

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(absolute)
      : entry.isFile() && entry.name.endsWith('.ts')
      ? [absolute]
      : [];
  });
}

const registry = JSON.parse(fs.readFileSync(MATERIAL_REGISTRY, 'utf8'));
const materialSources = new Map();
const registerMaterialSource = (sourcePath, boundaryId, kinds) => {
  if (
    typeof sourcePath !== 'string' ||
    !sourcePath.startsWith('base44/functions/') ||
    !sourcePath.endsWith('/entry.ts') ||
    !fs.existsSync(path.join(ROOT, sourcePath))
  ) return;
  const row = materialSources.get(sourcePath) || {
    boundary_ids: new Set(),
    material_effect_kinds: new Set(),
  };
  row.boundary_ids.add(boundaryId);
  for (const kind of kinds || []) row.material_effect_kinds.add(kind);
  materialSources.set(sourcePath, row);
};

for (const boundary of registry.boundaries || []) {
  for (const evidence of boundary.source_evidence || []) {
    registerMaterialSource(
      evidence?.path,
      String(boundary.boundary_id),
      boundary.material_kinds,
    );
  }
}
for (const route of registry.scheduler_inventory?.material_scheduled_routes || []) {
  registerMaterialSource(
    `base44/functions/${route.function_directory}/entry.ts`,
    'MB-SCHEDULER-BASE',
    [...new Set(['material_schedule', ...(route.material_kinds || [])])],
  );
}

const allSources = files(FUNCTIONS).map((absolute) => {
  const source = fs.readFileSync(absolute, 'utf8');
  const pathFromRoot = path.relative(ROOT, absolute).split(path.sep).join('/');
  return { absolute, source, path: pathFromRoot };
});

const creators = allSources.flatMap(({ source, path: pathFromRoot }) => {
  const rawCreateSites = count(source, /\.entities\.AgentTask\.create\s*\(/g);
  const canonicalRootSites = count(source, /createCanonicalAgentTask\s*\(/g);
  if (rawCreateSites + canonicalRootSites === 0) return [];
  const childLinkSites = count(source, /attachCanonicalChildTask\s*\(/g);
  const terminalSites = count(source, /settleCanonicalAgentTask\s*\(/g);
  const rawEventCreateSites = count(source, /\.entities\.Event\.create\s*\(/g);
  const canonicalEventCreateSites = count(
    source,
    /createCanonicalAgentEvent\s*\(/g,
  );
  const material = materialSources.get(pathFromRoot);
  const materialBoundaryIds = material
    ? [...material.boundary_ids].sort()
    : [];
  const materialEffectKinds = material
    ? [...material.material_effect_kinds].sort()
    : [];
  const rootAdapted = canonicalRootSites > 0 && rawCreateSites === 0;
  const terminalAdapted = rootAdapted && terminalSites > 0;
  // Absence of raw Event writes is not evidence of a canonical trace. A
  // material creator is Event-adapted only when it emits through the shared
  // adapter and has no parallel raw Event writer.
  const eventAdapted = canonicalEventCreateSites > 0 &&
    rawEventCreateSites === 0;
  const legacyStatus = rootAdapted
    ? 'ROOT_ENVELOPE_ADAPTED'
    : canonicalRootSites > 0
    ? 'PARTIAL_MIXED_CREATORS'
    : 'NOT_ADAPTED';
  const traceStatus = material
    ? terminalAdapted && eventAdapted
      ? 'MATERIAL_TRACE_ADAPTED_LOCAL'
      : rootAdapted
      ? 'MATERIAL_ROOT_ONLY'
      : 'MATERIAL_NOT_ADAPTED'
    : rootAdapted
    ? 'LEGACY_ROOT_ADAPTED'
    : 'LEGACY_NOT_ADAPTED';
  return [{
    path: pathFromRoot,
    source_sha256: sha256(source),
    raw_create_sites: rawCreateSites,
    canonical_root_create_sites: canonicalRootSites,
    canonical_child_link_sites: childLinkSites,
    canonical_terminal_sites: terminalSites,
    raw_event_create_sites: rawEventCreateSites,
    canonical_event_create_sites: canonicalEventCreateSites,
    status: legacyStatus,
    trace_status: traceStatus,
    classification: material
      ? 'MATERIAL_BOUNDARY_CREATOR'
      : 'LEGACY_COORDINATION_OR_OBSERVABILITY_CREATOR',
    material_boundary_ids: materialBoundaryIds,
    material_effect_kinds: materialEffectKinds,
    legacy_rows: 'UNKNOWN_UNLESS_ENVELOPE_VERSION_PRESENT',
    runtime_verified: false,
  }];
}).sort((left, right) => left.path.localeCompare(right.path));

const creatorByPath = new Map(creators.map((row) => [row.path, row]));
const materialRouteFiles = [...materialSources.entries()].map(([sourcePath, data]) => {
  const creator = creatorByPath.get(sourcePath) || null;
  const source = fs.readFileSync(path.join(ROOT, sourcePath), 'utf8');
  const rawEventCreateSites = count(source, /\.entities\.Event\.create\s*\(/g);
  const canonicalEventCreateSites = count(
    source,
    /createCanonicalAgentEvent\s*\(/g,
  );
  return {
    path: sourcePath,
    source_sha256: sha256(source),
    boundary_ids: [...data.boundary_ids].sort(),
    material_effect_kinds: [...data.material_effect_kinds].sort(),
    agenttask_creator: Boolean(creator),
    creator_trace_status: creator?.trace_status || 'NO_LOCAL_AGENTTASK_CREATOR',
    raw_event_create_sites: rawEventCreateSites,
    canonical_event_create_sites: canonicalEventCreateSites,
    trace_resolution: creator?.trace_status === 'MATERIAL_TRACE_ADAPTED_LOCAL'
      ? 'LOCAL_ENVELOPE_PRESENT_RUNTIME_PENDING'
      : creator
      ? 'PARTIAL_CREATOR_TRACE'
      : 'UNRESOLVED_NO_LOCAL_AGENTTASK_CREATOR',
  };
}).sort((left, right) => left.path.localeCompare(right.path));

const adapted = creators.filter((row) => row.status === 'ROOT_ENVELOPE_ADAPTED');
const partial = creators.filter((row) => row.status === 'PARTIAL_MIXED_CREATORS');
const unadapted = creators.filter((row) => row.status === 'NOT_ADAPTED');
const materialCreators = creators.filter(
  (row) => row.classification === 'MATERIAL_BOUNDARY_CREATOR',
);
const legacyCreators = creators.filter(
  (row) => row.classification !== 'MATERIAL_BOUNDARY_CREATOR',
);
const materialAdapted = materialCreators.filter(
  (row) => row.trace_status === 'MATERIAL_TRACE_ADAPTED_LOCAL',
);
const materialRootOnly = materialCreators.filter(
  (row) => row.trace_status === 'MATERIAL_ROOT_ONLY',
);
const materialUnadapted = materialCreators.filter(
  (row) => row.trace_status === 'MATERIAL_NOT_ADAPTED',
);
const unresolvedMaterialRoutes = materialRouteFiles.filter(
  (row) => row.trace_resolution !== 'LOCAL_ENVELOPE_PRESENT_RUNTIME_PENDING',
);
const routesWithoutCreator = materialRouteFiles.filter(
  (row) => !row.agenttask_creator,
);
const sourceInventoryHash = sha256(JSON.stringify({ creators, materialRouteFiles }));
const materialCreatorBlockers = [
  ...materialRootOnly.map((row) => `${row.path}:ROOT_ONLY`),
  ...materialUnadapted.map((row) => `${row.path}:NO_CANONICAL_ROOT`),
].sort();
const materialRouteBlockers = unresolvedMaterialRoutes.map((row) =>
  `${row.path}:${row.creator_trace_status}`
).sort();

const artifact = {
  schema_version: 'agenttask-creator-inventory-v2.0.0',
  envelope_version: 'agent-task-envelope-v2.0.0',
  generated_from: [
    'base44/functions/**/*.ts',
    'config/remediation/material-boundary-registry.v1.json',
  ],
  material_registry_schema_version: registry.schema_version,
  source_inventory_hash: sourceInventoryHash,
  counts: {
    creator_files: creators.length,
    raw_create_sites: creators.reduce((sum, row) => sum + row.raw_create_sites, 0),
    canonical_root_create_sites: creators.reduce(
      (sum, row) => sum + row.canonical_root_create_sites,
      0,
    ),
    canonical_child_link_sites: creators.reduce(
      (sum, row) => sum + row.canonical_child_link_sites,
      0,
    ),
    canonical_terminal_sites: creators.reduce(
      (sum, row) => sum + row.canonical_terminal_sites,
      0,
    ),
    root_envelope_adapted_files: adapted.length,
    partial_mixed_files: partial.length,
    not_adapted_files: unadapted.length,
    material_creator_files: materialCreators.length,
    legacy_creator_files: legacyCreators.length,
    material_trace_adapted_files: materialAdapted.length,
    material_root_only_files: materialRootOnly.length,
    material_not_adapted_files: materialUnadapted.length,
    material_route_files: materialRouteFiles.length,
    material_route_files_without_agenttask_creator: routesWithoutCreator.length,
    unresolved_material_route_files: unresolvedMaterialRoutes.length,
  },
  compatibility: {
    legacy_row_lineage: 'UNKNOWN',
    v1_envelope_lineage: 'PARTIAL_UNTIL_EXPLICIT_V2_RECONCILIATION',
    implicit_parent_inference: false,
    implicit_trace_inference: false,
    implicit_effect_receipt_inference: false,
    backfill_performed: false,
  },
  root_otr_013: {
    implementation_status: 'PARTIAL',
    binary_closure_status: 'NOT_MET',
    local_test_status: 'PASSED_LOCAL',
    verification_level: 'LOCAL_FAILURE_INJECTION',
    blockers: [
      `${materialCreatorBlockers.length} material creator file(s) lack a complete local terminal envelope`,
      `${routesWithoutCreator.length} material route file(s) have no local AgentTask creator`,
      `${unresolvedMaterialRoutes.length} material route file(s) do not resolve locally to a complete effect/cost/receipt envelope`,
      'production trace completeness, orphan counts and actual provider receipt linkage are RUNTIME_PENDING',
    ],
    material_creator_blockers: materialCreatorBlockers,
    material_route_blockers: materialRouteBlockers,
    runtime_pending: [
      'production final-SHA trace completeness scan',
      'real material runs joined to provider/domain receipts',
      'real CostUsageEvent linkage for paid effects',
      'legacy AgentTask/Event backfill decision and execution',
      'runtime orphan and ambiguous-effect denominator windows',
    ],
  },
  material_route_files: materialRouteFiles,
  creators,
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

if (CHECK) {
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== serialized) {
    console.error(
      'agenttask-creator-inventory:check FAIL — regenerate with node scripts/generate-agenttask-creator-inventory.mjs',
    );
    process.exit(1);
  }
  console.log(
    `agenttask-creator-inventory:check PASS — ${creators.length} creator files, ${materialCreators.length} material, ${materialAdapted.length} material terminal-adapted, ${unresolvedMaterialRoutes.length} unresolved material route files`,
  );
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialized);
  console.log(
    `agenttask-creator-inventory:generate PASS — ${creators.length} creator files, ${materialCreators.length} material, ${materialAdapted.length} material terminal-adapted, ${unresolvedMaterialRoutes.length} unresolved material route files`,
  );
}
