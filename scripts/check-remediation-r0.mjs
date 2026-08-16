#!/usr/bin/env node
import process from "node:process";
import {
  checkArtifacts,
  EFFECT_AUTHORITY_OUTPUT,
  MATERIAL_BOUNDARY_OUTPUT,
  REPO_ROOT,
  RESEARCH_CORPUS_OUTPUT,
  TENANT_AUTHORIZATION_OUTPUT,
} from "./generate-remediation-r0.mjs";

try {
  const artifacts = checkArtifacts(REPO_ROOT);
  const boundaries = artifacts[MATERIAL_BOUNDARY_OUTPUT];
  const effectAuthority = artifacts[EFFECT_AUTHORITY_OUTPUT];
  const tenantAuthorization = artifacts[TENANT_AUTHORIZATION_OUTPUT];
  const research = artifacts[RESEARCH_CORPUS_OUTPUT];
  console.log(
    `remediation-r0:check PASS — ${boundaries.summary.boundary_count} material boundaries; ` +
      `${effectAuthority.summary.effect_class_count} effect classes/${effectAuthority.summary.locally_wired_boundary_count} locally wired boundaries; ` +
      `${boundaries.paid_ai_inventory.caller_count} AI callers; ` +
      `${boundaries.scheduler_inventory.scheduled_automation_count}/${boundaries.scheduler_inventory.active_count}/${boundaries.scheduler_inventory.guarded_count} scheduled/active/guarded; ` +
      `${tenantAuthorization.summary.route_count} tenant authorization rows/${tenantAuthorization.summary.binary_closed_count} closed/${tenantAuthorization.summary.runtime_verified_count} runtime-verified; ` +
      `${research.physical.physical_files}/${research.physical.unique_sha256}/${research.physical.exact_duplicates} research physical/unique/duplicates; ` +
      `${research.status}; R6=${research.r6_gate.status}`,
  );
} catch (error) {
  console.error(`remediation-r0:check FAIL — ${error?.message || error}`);
  process.exitCode = 1;
}
