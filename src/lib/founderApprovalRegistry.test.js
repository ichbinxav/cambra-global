import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const EXPECTED_ACTIONS = [
  'aggregate_contract',
  'aggregate_contract_execution',
  'aggregate_procurement_review',
  'commercial_reply_exception',
  'contract_exception',
  'contract_mismatch',
  'developer_apply_patch',
  'developer_rollback',
  'final_provider_deal',
  'migration_go_live',
  'post_meeting_commitment_review',
  'provider_negotiation_review',
  'publish_blog',
  'publish_linkedin_post',
  'publish_x_post',
  'schedule_founder_meeting',
  'send_follow_up_email',
  'send_investor_update',
  'send_newsletter',
  'send_outreach_email',
].sort();

function functionEntries() {
  // AUDIT 2026-08-18: logical-route implementations now live in
  // base44/shared/logical/, so Approval producers are scanned there too.
  const functionsRoot = path.join(root, 'base44/functions');
  const logicalRoot = path.join(root, 'base44/shared/logical');
  return fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(functionsRoot, entry.name, 'entry.ts'))
    .concat(fs.readdirSync(logicalRoot)
      .filter(name => name.endsWith('.ts'))
      .map(name => path.join(logicalRoot, name)))
    .filter(file => fs.existsSync(file));
}

function actionTypesCreatedByApprovals() {
  const found = new Set();
  for (const file of functionEntries()) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('Approval.create(')) continue;
    const actionConstant = source.match(/const\s+ACTION_TYPE\s*=\s*['"]([^'"]+)['"]/)?.[1];
    for (const call of source.matchAll(/Approval\.create\(/g)) {
      const callWindow = source.slice(call.index, call.index + 5000);
      const expression = callWindow.match(
        /action_type\s*:\s*([\s\S]*?),\s*(?:related_entity_type|risk_level)/,
      )?.[1]?.trim();
      expect(expression, `Missing action_type in ${file}`).toBeTruthy();
      if (expression === 'ACTION_TYPE') {
        expect(actionConstant, `Unresolved ACTION_TYPE in ${file}`).toBeTruthy();
        found.add(actionConstant);
        continue;
      }
      const direct = expression.match(/^['"]([^'"]+)['"]/);
      if (direct) {
        found.add(direct[1]);
        continue;
      }
      const outcomes = [...expression.matchAll(/[?:]\s*['"]([^'"]+)['"]/g)]
        .map(match => match[1]);
      expect(outcomes.length, `Unparsed action_type expression in ${file}: ${expression}`).toBeGreaterThan(0);
      outcomes.forEach(value => found.add(value));
    }
  }
  return [...found].sort();
}

function registrySource() {
  const gateway = read('base44/functions/founderOSCommand/entry.ts');
  const start = gateway.indexOf('const APPROVAL_RESOLUTION_REGISTRY');
  const end = gateway.indexOf('\n});', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return gateway.slice(start, end + 4);
}

function registryKeys(source) {
  return [...source.matchAll(/^\s*"([^"]+)":\s*\{/gm)]
    .map(match => match[1])
    .sort();
}

describe('Founder approval action registry', () => {
  it('enumerates every action_type produced by Approval.create and nothing else', () => {
    const produced = actionTypesCreatedByApprovals();
    expect(produced).toEqual(EXPECTED_ACTIONS);
    expect(registryKeys(registrySource())).toEqual(produced);
  });

  it('gives every previously unresolvable Developer and investor approval a finite expiry', () => {
    const developer = read('base44/functions/developerMigrationEngine/entry.ts');
    for (const action of ['developer_apply_patch', 'migration_go_live', 'developer_rollback']) {
      const start = developer.indexOf(`action_type: "${action}"`);
      const end = developer.indexOf('status: "pending"', start);
      expect(start, action).toBeGreaterThan(-1);
      expect(developer.slice(start, end), action).toContain('expires_at:');
    }
    const investor = read('base44/functions/investorUpdateAgent/entry.ts');
    const start = investor.indexOf('action_type: ACTION_TYPE');
    const end = investor.indexOf('status: "pending"', start);
    expect(investor.slice(start, end)).toContain('expires_at:');
  });

  it('maps every action to explicit fail-closed semantics', () => {
    const registry = registrySource();
    const modes = {
      aggregate_contract: 'commercial',
      aggregate_contract_execution: 'commercial',
      aggregate_procurement_review: 'commercial',
      commercial_reply_exception: 'commercial',
      contract_exception: 'commercial',
      contract_mismatch: 'commercial',
      final_provider_deal: 'commercial',
      post_meeting_commitment_review: 'commercial',
      provider_negotiation_review: 'commercial',
      send_outreach_email: 'external_executor',
      send_follow_up_email: 'external_executor',
      schedule_founder_meeting: 'external_executor',
      publish_blog: 'external_executor',
      publish_linkedin_post: 'external_executor',
      publish_x_post: 'external_executor',
      send_newsletter: 'external_executor',
      send_investor_update: 'blocked',
      developer_apply_patch: 'developer_authorization',
      migration_go_live: 'developer_authorization',
      developer_rollback: 'developer_authorization',
    };
    for (const [action, mode] of Object.entries(modes)) {
      const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(registry).toMatch(
        new RegExp(`"${escaped}": \\{[\\s\\S]*?mode: "${mode}"`),
      );
    }
  });

  it('binds durable developer authorization to run, workspace, task, repo and exact lifecycle links', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    for (const marker of [
      'validateDeveloperAuthorizationBinding',
      'DeveloperMigrationRun',
      'DeveloperWorkspace',
      'approval.agent_task_id',
      'payload.workspace_id',
      'payload.run_id',
      'payload.repo_full_name',
      'run.approval_id',
      'run.cutover_approval_id',
      'run.verification?.rollback_approval_id',
      'payload.base_sha',
      'payload.approved_head_sha',
      'payload.expected_head_sha',
      'payload.rollback_sha',
      'canonical_executor: "developerMigrationEngine"',
      'authorization_only: true',
    ]) expect(gateway).toContain(marker);
    expect(gateway).toContain('developerMigrationEngine:apply_plan');
    expect(gateway).toContain('developerMigrationEngine:cutover');
    expect(gateway).toContain('developerMigrationEngine:rollback');
  });

  it('records authorization before external execution and never strands it on transport failure', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    const start = gateway.indexOf('else if (rule.mode === "external_executor")');
    const end = gateway.indexOf('} else {', start);
    const branch = gateway.slice(start, end);
    expect(branch.indexOf('finalizeAuthorization("approved")')).toBeGreaterThan(-1);
    expect(branch.indexOf('finalizeAuthorization("approved")'))
      .toBeLessThan(branch.indexOf('base44.functions.invoke(rule.resolver'));
    expect(branch).toContain('persistApprovedButExecutionFailed');
    expect(gateway).toContain('event_type: "founder_approval_executor"');
    expect(gateway).toContain('"approved_but_executor_failed"');
    expect(gateway).toContain('"approved_execution_review_required"');
    expect(gateway).toContain('retry_requires_new_approval: false');
    expect(gateway).toContain('deriveApprovalLifecycle(approval, task)');
    expect(gateway).toContain('executionStatus !== "EXECUTED"');
    expect(gateway).toContain('approval_authorization_finalization_readback_mismatch');
    expect(gateway).toContain('approval_resolution_claim_readback_mismatch');
    expect(gateway).toContain('installApprovalConfirmationPreview');
    expect(gateway).toContain('confirmation_preview_generation');
    expect(gateway).toContain('installedStateFingerprint');
    expect(gateway).toContain('retry_requires_new_preview');
    expect(gateway).toContain(
      'const commandKey = String(input.command_key || body.command_key || newKey())',
    );
    const approvalPreviewStart = gateway.indexOf(
      'previewAuthority = await installApprovalConfirmationPreview(',
    );
    const approvalPreviewEnd = gateway.indexOf(
      'const stored = await storedPreview(',
      approvalPreviewStart,
    );
    const approvalPreview = gateway.slice(
      approvalPreviewStart,
      approvalPreviewEnd,
    );
    expect(approvalPreview).toContain('commandKey,');
    expect(approvalPreview).toContain('command_key: commandKey,');
  });

  it('consumes an unambiguous one-use nonce through every Founder approval UI', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    expect(gateway).toContain('result.success === false || result.ok === false');
    expect(gateway).toContain('founder_command_preview_ambiguous');
    expect(gateway).toContain('founder_command_execution_ambiguous');
    expect(gateway).toContain('approval_confirmation_nonce_required');
    expect(gateway).toContain('resolution_nonce_used_at');
    expect(gateway).toContain('claimObserved.resolution_nonce_used_at, nonceUsedAt');
    expect(gateway).toContain('claimObserved.resolution_binding_json?.binding_hash');
    for (const file of [
      'src/pages/admin/AdminApprovals.jsx',
      'src/pages/admin/AdminInbox.jsx',
      'src/pages/admin/AdminFounderControl.jsx',
    ]) {
      expect(read(file), file).toContain('confirmation_nonce');
    }
  });

  it('keeps chat confirmation nonces transient and redacts them from durable messages', () => {
    const chatChief = read('base44/functions/chatChiefOrchestrator/entry.ts');
    const adminChat = read('src/pages/admin/AdminChat.jsx');
    expect(chatChief).toContain('confirmation_nonce = ""');
    expect(chatChief).toContain('delete auditedInput.confirmation_nonce');
    expect(chatChief).toContain('confirmation_nonce: confirmationNonce');
    expect(chatChief).toContain("error: 'approval_confirmation_nonce_missing'");
    expect(chatChief).toContain('delete pendingInput.confirmation_nonce');

    const previewPersistenceStart = chatChief.indexOf(
      "if (!invokeError && tool.function === 'founderOSCommand' && invokeResult?.requires_confirmation)",
    );
    const previewPersistenceEnd = chatChief.indexOf(
      '// Build the assistant reply text',
      previewPersistenceStart,
    );
    const previewBranch = chatChief.slice(
      previewPersistenceStart,
      previewPersistenceEnd,
    );
    const durableCreateStart = previewBranch.indexOf('ChatMessage.create({');
    const durableCreateEnd = previewBranch.indexOf('return Response.json', durableCreateStart);
    expect(previewBranch.slice(durableCreateStart, durableCreateEnd))
      .not.toContain('confirmation_nonce: confirmationNonce');

    expect(adminChat).toContain('const [confirmationNonces, setConfirmationNonces] = useState({})');
    expect(adminChat).toContain('confirmation_nonce: opts.confirmation_nonce || undefined');
    expect(adminChat).toContain('confirmationNonces[commandKey]');
    expect(adminChat).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\([^\n]*confirmation/i);
  });

  it('supports safe same-command recovery and finalized reject metadata without a blind reset', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    expect(gateway).toContain('const isNonCommercialResume');
    expect(gateway).toContain('approval_resolution_resume_snapshot_mismatch');
    expect(gateway).toContain('approval_resolution_requires_manual_reconciliation');
    expect(gateway).toContain('resolution_effects_started: false');
    expect(gateway).toContain('resolution_phase: "finalized"');
    expect(gateway).toContain('rejected_reason: terminalStatus === "rejected" ? reason : ""');
    expect(gateway).not.toMatch(/\$set:\s*\{[\s\S]{0,180}status:\s*"pending"/);
  });

  it('reports approval resolution separately from material execution in API replays and chat', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    const authority = read('base44/shared/approvalAuthority.ts');
    for (const marker of [
      'canonicalApprovalCommandResult',
      'executionReplayResponse',
      'founderOSCommand.canonical_approval_execution_read',
      'founderOSCommand.canonical_approval_task_execution_read',
      'commandResponseProjection',
      'projectCanonicalApprovalCommandResult',
      'projectApprovalCommandResponse',
      'command_status: commandStatus',
      'approval_execution_authority_ambiguous',
    ]) expect(gateway).toContain(marker);
    expect(authority).toContain(
      'status: executionStatus === "EXECUTED" ? "executed" : "resolved"',
    );
    expect(authority).toContain('approval_execution_status_unavailable');
    expect(authority).toContain('...(input?.recordedResult || {})');

    const persistStart = gateway.indexOf('async function persistExecution');
    const persistEnd = gateway.indexOf('\nfunction sameText', persistStart);
    const persist = gateway.slice(persistStart, persistEnd);
    expect(persist).toContain('return executionReplayResponse(');
    expect(persist).toContain('...projection');
    expect(persist).toContain('result_json: result');

    const confirmedReplayStart = gateway.indexOf('if (confirmed) {');
    const confirmedReplayEnd = gateway.indexOf(
      'if (action === "save_admin_locale_preference")',
      confirmedReplayStart,
    );
    const confirmedReplay = gateway.slice(
      confirmedReplayStart,
      confirmedReplayEnd,
    );
    expect(confirmedReplay).toContain('return executionReplayResponse(');
    expect(confirmedReplay).not.toContain('status: "executed"');

    const replayProjectionStart = gateway.indexOf(
      'async function executionReplayResponse',
    );
    const replayProjectionEnd = gateway.indexOf(
      '\nfunction previewExpired',
      replayProjectionStart,
    );
    const replayProjection = gateway.slice(
      replayProjectionStart,
      replayProjectionEnd,
    );
    expect(replayProjection).toContain('const priorResult = approvalReplay');
    expect(replayProjection).toContain('? await canonicalApprovalCommandResult(');
    expect(replayProjection).not.toContain('defensibleRecordedApprovalExecution');

    const chat = read('base44/functions/chatChiefOrchestrator/entry.ts');
    expect(chat).toContain('founderCommandExecutionStatus');
    expect(chat).toContain("invokeResult?.result?.execution_status");
    expect(chat).toContain('founderCommandSemanticStatus');
    expect(chat).toContain('status: recordedToolStatus');
    expect(chat).toContain("invokeResult?.status === 'resolved'");
    expect(chat).toContain("founderCommandExecutionStatus !== 'EXECUTED'");
    expect(chat).toContain('He registrado la decisión gobernada. Estado de ejecución:');
  });

  it('blocks investor transport and has no ambiguous material or task-name fallback', () => {
    const gateway = read('base44/functions/founderOSCommand/entry.ts');
    expect(gateway).toContain('investor_update_transport_not_configured');
    expect(gateway).toContain('error: "approval_action_blocked"');
    expect(gateway).toContain('error: "unsupported_approval_action_type"');
    expect(gateway).not.toContain('approval_state_only');
    expect(gateway).not.toContain('executableAgents');
    expect(gateway).not.toContain('task?.agent_name &&');
  });

  it('keeps Admin Approvals behind the canonical Founder gateway', () => {
    const approvals = read('src/pages/admin/AdminApprovals.jsx');
    const approvalSchema = JSON.parse(read('base44/entities/Approval.jsonc'));
    expect(approvals).toContain('founderOSCommand');
    expect(approvals).toContain('action: "resolve_approval"');
    expect(approvals).not.toMatch(/entities\.Approval\.(?:update|updateMany|delete|create)/);
    expect(approvalSchema.rls.write).toEqual({
      user_condition: { role: '__service_role_only__' },
    });
    for (const file of fs.readdirSync(path.join(root, 'src'), {
      recursive: true,
      withFileTypes: true,
    }).filter(entry => entry.isFile() && /\.(?:[jt]sx?|mjs)$/.test(entry.name))) {
      const source = fs.readFileSync(path.join(file.parentPath, file.name), 'utf8');
      expect(source, path.join(file.parentPath, file.name)).not.toMatch(
        /entities\.Approval\.(?:create|update|updateMany|delete)\s*\(/,
      );
    }
  });

  it('keeps Founder command previews service-write-only and backend writers on service role', () => {
    const schema = JSON.parse(read('base44/entities/FounderCommandAudit.jsonc'));
    expect(schema.rls.read).toEqual({ user_condition: { role: 'admin' } });
    expect(schema.rls.write).toEqual({
      user_condition: { role: '__service_role_only__' },
    });

    for (const file of fs.readdirSync(path.join(root, 'src'), {
      recursive: true,
      withFileTypes: true,
    }).filter(entry => entry.isFile() && /\.(?:[jt]sx?|mjs)$/.test(entry.name))) {
      const source = fs.readFileSync(path.join(file.parentPath, file.name), 'utf8');
      expect(source, path.join(file.parentPath, file.name)).not.toMatch(
        /entities\.FounderCommandAudit\.(?:create|update|updateMany|delete)\s*\(/,
      );
    }

    for (const file of [
      'base44/functions/founderOSCommand/entry.ts',
      'base44/functions/emergencyControlAdmin/entry.ts',
      'base44/shared/logical/founderMeetingAdmin.ts',
      'base44/shared/logical/goLiveControlAdmin.ts',
    ]) {
      // FCTRL-J: emergencyControlAdmin's handler lives in the shared core; its
      // entry stays the trust boundary that resolves asServiceRole.
      const source = file.includes('emergencyControlAdmin')
        ? read(file) + read('base44/shared/emergencyControlAdminCore.ts')
        : read(file);
      expect(source, file).toContain('asServiceRole');
      expect(source, file).toContain('FounderCommandAudit.create');
    }
  });
});