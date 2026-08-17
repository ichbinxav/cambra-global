#!/usr/bin/env node
// DASHBOARD-C3 (2026-08-17) — Pipeline workspace integrity.
//
// The properties this gate protects are the ones that would silently rot: the
// registry and the entity enums drifting apart, a second stage authority
// appearing, or the dead entity being resurrected.
import fs from 'node:fs';
import process from 'node:process';

const REGISTRY = 'config/dashboard/pipeline-stage-registry.v1.json';
let failures = 0;
const fail = (m) => { console.error(`pipeline:check FAIL — ${m}`); failures += 1; };

if (!fs.existsSync(REGISTRY)) { fail(`${REGISTRY} missing`); process.exit(1); }
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const entity = (name) => JSON.parse(fs.readFileSync(`base44/entities/${name}.jsonc`, 'utf8'));

// 1. Every legacy value the authority entity declares must be mapped. An
//    unmapped enum value would silently resolve to UNKNOWN in production.
let mapped = 0;
for (const [lane, node] of Object.entries(registry.lanes)) {
  const authorityEntity = node.authority?.entity;
  if (!authorityEntity) { fail(`${lane} declares no authority entity`); continue; }
  if (!fs.existsSync(`base44/entities/${authorityEntity}.jsonc`)) {
    fail(`${lane} authority ${authorityEntity} does not exist`); continue;
  }
  const props = entity(authorityEntity).properties || {};
  for (const column of node.authority.columns || []) {
    const declared = props[column]?.enum;
    if (!declared) { fail(`${authorityEntity}.${column} declares no enum`); continue; }
    const table = node.legacy_mappings?.[column] || {};
    for (const value of declared) {
      if (!table[value]) fail(`${lane}: ${authorityEntity}.${column} value "${value}" is unmapped`);
      else mapped += 1;
    }
    // A mapping for a value the enum no longer declares is stale.
    for (const key of Object.keys(table)) {
      if (!declared.includes(key)) fail(`${lane}: stale mapping for ${authorityEntity}.${column} value "${key}"`);
    }
  }
}

// 2. Every canonical target must be a declared stage of its lane.
for (const [lane, node] of Object.entries(registry.lanes)) {
  const keys = new Set((node.stages || []).map((s) => s.key));
  for (const [column, table] of Object.entries(node.legacy_mappings || {})) {
    for (const [value, target] of Object.entries(table)) {
      if (!keys.has(target)) fail(`${lane}.${column}: "${value}" maps to unknown stage ${target}`);
    }
  }
}

// 3. Stage orders unique and ascending; every lane has a win.
for (const [lane, node] of Object.entries(registry.lanes)) {
  const orders = (node.stages || []).map((s) => s.order);
  if (new Set(orders).size !== orders.length) fail(`${lane} has duplicate stage orders`);
  if (JSON.stringify(orders) !== JSON.stringify([...orders].sort((a, b) => a - b))) fail(`${lane} stage orders are not ascending`);
  if (!(node.stages || []).some((s) => s.semantics === 'win')) fail(`${lane} declares no win stage`);
}

// 4. The dead entity must not be resurrected as an authority.
const retired = registry.retired_authority?.entity;
if (!retired) fail('retired_authority is not declared');
for (const [lane, node] of Object.entries(registry.lanes)) {
  if (node.authority?.entity === retired) fail(`${lane} uses the retired authority ${retired}`);
}
const core = fs.readFileSync('base44/shared/pipelineCore.ts', 'utf8');
if (new RegExp(`entities\\.${retired}\\b`).test(core)) {
  fail(`pipelineCore reads the retired authority ${retired}`);
}

// 5. The projection must not become an authority: no generic pipeline entity.
for (const forbidden of ['PipelineItem', 'PipelineCase', 'CommercialPipelineCase']) {
  if (fs.existsSync(`base44/entities/${forbidden}.jsonc`)) {
    fail(`${forbidden} exists — the projection must not become a second stage authority`);
  }
}

// 6. The one new entity must stay append-only in intent and carry its audit fields.
const eventProps = entity('PipelineStageEvent').properties || {};
for (const field of ['from_stage', 'to_stage', 'actor', 'actor_kind', 'reason_code', 'source_event_type', 'stage_registry_version', 'direction', 'confidence', 'occurred_at']) {
  if (!eventProps[field]) fail(`PipelineStageEvent is missing ${field}`);
}
const required = entity('PipelineStageEvent').required || [];
for (const field of ['actor', 'actor_kind', 'to_stage', 'stage_registry_version', 'confidence']) {
  if (!required.includes(field)) fail(`PipelineStageEvent must require ${field}`);
}

// 7. The lifecycle lane must stay projection-only.
if (registry.lanes.MERCHANT_LIFECYCLE?.projection_only !== true) {
  fail('MERCHANT_LIFECYCLE must remain projection_only — DealActivation already has a guarded authority');
}

if (failures) process.exit(1);
const lanes = Object.keys(registry.lanes).length;
const stages = Object.values(registry.lanes).reduce((n, l) => n + (l.stages || []).length, 0);
console.log(
  `pipeline:check PASS — ${lanes} lanes, ${stages} canonical stages, ${mapped} legacy enum values mapped with zero stale entries, ` +
  `retired authority ${retired} refused, no generic pipeline entity, lifecycle lane projection-only`,
);
