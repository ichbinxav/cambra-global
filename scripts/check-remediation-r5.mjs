#!/usr/bin/env node
import process from 'node:process';
import { checkArtifact, REPO_ROOT } from './generate-remediation-r5.mjs';

try {
  const artifact = checkArtifact(REPO_ROOT);
  console.log(
    `remediation-r5:check PASS — ${artifact.summary.otr_count} OTR rows; ` +
    `${artifact.summary.implementation_partial_count} PARTIAL; ` +
    `${artifact.summary.implementation_repo_remediated_runtime_pending_count} REPO_REMEDIATED_RUNTIME_PENDING; ` +
    `${artifact.evidence.length} evidence files; 0 CLOSED; 0 runtime-verified.`,
  );
} catch (error) {
  console.error(`remediation-r5:check FAIL — ${error?.message || error}`);
  process.exitCode = 1;
}
