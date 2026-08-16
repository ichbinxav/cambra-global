#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const OUTPUT = 'config/agent-workforce-catalog.v1.json';
const REGISTRY = 'src/lib/agentRegistry.js';
const AUTHORITY = 'base44/shared/agentAuthority.ts';
const PACKAGE = 'package.json';
const check = process.argv.includes('--check');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const registryModule = await import(`${pathToFileURL(path.join(ROOT, REGISTRY)).href}?catalog=1`);
const clusters = registryModule.CLUSTERS;
const orchestrators = registryModule.ORCHESTRATORS;
const authoritySource = fs.readFileSync(AUTHORITY, 'utf8');
const packageDocument = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
const capabilityNames = [
  'CAN_READ', 'CAN_WRITE', 'CAN_SEND', 'CAN_NEGOTIATE', 'CAN_SCHEDULE',
  'CAN_EXECUTE', 'CAN_APPROVE', 'CAN_SIGN', 'CAN_SPEND', 'CAN_CHARGE',
];
const authorityRows = [];
for (const match of authoritySource.matchAll(/([a-z0-9_]+):A\(\{([^}]*)\}\)/g)) {
  const enabled = new Set(
    [...match[2].matchAll(/(CAN_[A-Z_]+)\s*:\s*true/g)].map((row) => row[1]),
  );
  authorityRows.push({
    agent_key: match[1],
    capabilities: Object.fromEntries(capabilityNames.map((name) => [name, enabled.has(name)])),
    material_authority: capabilityNames
      .filter((name) => ['CAN_APPROVE', 'CAN_SIGN', 'CAN_SPEND', 'CAN_CHARGE'].includes(name))
      .some((name) => enabled.has(name))
      ? 'PRESENT'
      : 'NONE',
  });
}
authorityRows.sort((left, right) => left.agent_key.localeCompare(right.agent_key));

const agents = clusters.flatMap((cluster) => cluster.agents.map((agent) => ({
  cluster_key: cluster.key,
  cluster_label: cluster.label,
  name: agent.name,
  function_name: agent.fn,
  level: agent.level,
  tool: agent.tool,
  secret_name: agent.secret || null,
  input_requirement: agent.requiresInput || null,
  status: agent.status || 'DECLARED_ACTIVE',
  canonical_replacement: agent.canonicalReplacement || null,
  description: agent.desc,
})));

const payload = {
  schema_version: 'agent-workforce-catalog-v1.0.0',
  generation: {
    mode: 'SOURCE_DERIVED',
    sources: [
      { path: REGISTRY, sha256: sha256(REGISTRY) },
      { path: AUTHORITY, sha256: sha256(AUTHORITY) },
      { path: PACKAGE, sha256: sha256(PACKAGE) },
    ],
  },
  release_identity: {
    package_version: String(packageDocument.version || ''),
    release_name: String(packageDocument.releaseName || ''),
  },
  counts: {
    declared_agents: agents.length,
    declared_orchestrators: orchestrators.length,
    authority_rows: authorityRows.length,
    quarantined_compatibility_agents: agents.filter((row) => row.status === 'QUARANTINED_COMPATIBILITY').length,
    material_authority_rows: authorityRows.filter((row) => row.material_authority !== 'NONE').length,
  },
  health_plane_relationships: {
    canonical_general_supervisor: 'autonomousOperationsSupervisor',
    advisory_projection: 'operatingHealthWorker',
    release_readiness_evaluator: 'productionReadinessWorker',
    quarantined_compatibility_surface: 'systemHealthAgent',
    active_general_supervisor_count: 1,
  },
  agents,
  orchestrators: orchestrators.map((row) => ({
    name: row.name,
    function_name: row.fn,
    input_requirement: row.requiresInput || null,
    description: row.desc,
  })),
  authority_rows: authorityRows,
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (check) {
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== serialized) {
    console.error(`agent-workforce:check FAIL — regenerate ${OUTPUT}`);
    process.exit(1);
  }
  console.log(`agent-workforce:check PASS — ${agents.length} agents, ${orchestrators.length} orchestrators, ${authorityRows.length} authority rows, one general supervisor.`);
} else {
  fs.writeFileSync(OUTPUT, serialized);
  console.log(`agent-workforce:generate PASS — wrote ${OUTPUT}`);
}
