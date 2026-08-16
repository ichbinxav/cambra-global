#!/usr/bin/env node
import process from 'node:process';
import { checkArtifact, REPO_ROOT } from './generate-remediation-r4.mjs';

try {
  const artifact = checkArtifact(REPO_ROOT);
  console.log(
    `remediation-r4:check PASS — ${artifact.summary.saga_row_count} saga rows; ` +
    `${artifact.approval_inventory.creator_file_count} approval creator files; ` +
    `${artifact.approval_inventory.action_type_count} action types; ` +
    `${artifact.approval_inventory.external_executor_action_count} external executor actions; ` +
    `${artifact.evidence.length} hash-bound evidence files; ` +
    `0 CLOSED; 0 runtime-verified; OTR-011 PARTIAL`,
  );
} catch (error) {
  console.error(`remediation-r4:check FAIL — ${error?.message || error}`);
  process.exitCode = 1;
}
