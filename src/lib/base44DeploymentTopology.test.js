import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const functionsRoot = path.join(root, 'base44', 'functions');
const topology = JSON.parse(fs.readFileSync(path.join(root, 'base44', 'deployment-topology.json'), 'utf8'));
const logicalRoutes = topology.logical_routes;
const logicalNames = Object.keys(logicalRoutes);
const directories = fs.readdirSync(functionsRoot, { withFileTypes:true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const logicalDirectories = logicalNames.filter((name) => directories.includes(name));
const physicalNames = directories.filter((name) => !logicalDirectories.includes(name));
const source = (name) => fs.readdirSync(path.join(functionsRoot, name)).filter((file) => file.endsWith('.ts')).map((file) => fs.readFileSync(path.join(functionsRoot, name, file), 'utf8')).join('\n');
const logicalSource = (name, route) => route.source_module
  ? fs.readFileSync(path.join(root, route.source_module), 'utf8')
  : source(name);
const config = (name) => JSON.parse(fs.readFileSync(path.join(functionsRoot, name, 'function.jsonc'), 'utf8'));

describe('Base44 quota-safe backend deployment topology', () => {
  // DPA-1 (2026-08-16) — deliberately 27 -> 28: `recordLegalAcceptance`
  // (host claimAnonPaymentsResult, source_module base44/shared/legalAcceptance.ts).
  // R4: this number is an invariant, so it is raised on purpose and never
  // loosened into an inequality. The PHYSICAL count is what protects the quota
  // and it is unchanged at 276 — a logical route adds an action to an already
  // deployed entry point, not a new deployment unit.
  // CAMP-C5 (2026-08-16): 28 -> 29 for conversationAdmin (Inbox &
  // Conversations read model on the existing adminSummaries host).
  // COMMAND-C2 (2026-08-17): 29 -> 30 for commandConversationAdmin (durable
  // Command conversations, also on adminSummaries). Physical stays 276.
  // COMMAND-C6 (2026-08-17): 30 -> 31 for commandRunAdmin (durable run executor).
  // COMMAND-C7 (2026-08-17): 31 -> 32 for commandRunWorker (scheduled run sweep).
  // DASHBOARD-C3 (2026-08-17): 32 -> 33 for pipelineWorkspaceAdmin.
  // DASHBOARD-C4 (2026-08-17): 33 -> 34 for auditsWorkspaceAdmin.
  it('consolidates exactly 34 logical routes into the 276 grandfathered physical functions', () => {
    expect(logicalNames).toHaveLength(34);
    expect(physicalNames).toHaveLength(topology.physical_function_target);
    expect(new Set(physicalNames).size).toBe(physicalNames.length);
    for (const [logicalName, route] of Object.entries(logicalRoutes)) {
      if (route.source_module) expect(fs.existsSync(path.join(root, route.source_module))).toBe(true);
      else expect(directories).toContain(logicalName);
      expect(physicalNames).toContain(route.host);
      expect(logicalDirectories).not.toContain(route.host);
    }
  });

  it('keeps Stripe and public webhook trust boundaries physical and isolated', () => {
    const stripeFunctions = physicalNames.filter((name) => name.toLowerCase().includes('stripe'));
    expect(stripeFunctions.length).toBeGreaterThan(0);
    expect(logicalNames.filter((name) => name.toLowerCase().includes('stripe'))).toEqual([]);
    expect(logicalRoutes.instantlyWebhook.host).toBe('resendInboundWebhook');
    expect(logicalRoutes.instantlyWebhook.boundary).toContain('public_authenticated_webhook_isolated');
    expect(source('resendInboundWebhook')).toContain("req.headers.get('x-cambra-instantly-secret')");
  });

  it('routes every newly hosted scheduled worker through an active physical automation', () => {
    const hosted = [];
    for (const physicalName of physicalNames) {
      const configPath = path.join(functionsRoot, physicalName, 'function.jsonc');
      if (!fs.existsSync(configPath)) continue;
      for (const automation of config(physicalName).automations || []) {
        if (automation.is_active !== true) continue;
        if (automation.function_args?.hosted_worker) hosted.push(automation.function_args.hosted_worker);
        hosted.push(...(automation.function_args?.hosted_workers || []));
      }
    }
    expect(hosted).toEqual(expect.arrayContaining([
      'autonomousCompanyOrchestrator',
      'costGovernanceWorker',
      'productionReadinessWorker',
      'regulatoryMonitoringWorker',
      'instantlyProviderEventRetryWorker',
      'instantlyReconciliationWorker',
      'europeanGrowthIntelligenceWorker',
      'getEuropeanGrowthCommandCenter',
      'disasterRecoveryBackup',
      'commandRunWorker',
    ]));
  });

  it('preserves explicit route selectors in their physical hosts', () => {
    for (const [logicalName, route] of Object.entries(logicalRoutes)) {
      const hostSource = `${source(route.host)}\n${logicalSource(logicalName, route)}`;
      const selectors = Object.values(route.route).flat().filter((value) => typeof value === 'string' && !['meeting', 'go_live'].includes(value));
      for (const selector of selectors) expect(hostSource, `${logicalName} -> ${route.host} is missing selector ${selector}`).toContain(selector);
    }
  });

  it('normalizes nested Response bodies at hosts affected by Base44 double serialization', () => {
    for (const name of ['getEuropeMarketsCommandCenter', 'outboundControlAdmin']) {
      const hostSource = source(name);
      expect(hostSource, name).toContain('normalizeRoutedJson');
      expect(hostSource, name).toContain("for (let layer=0; layer<4 && typeof value==='string'; layer++)");
      expect(hostSource, name).toContain('value=JSON.parse(value)');
    }
    const clientSource = fs.readFileSync(path.join(root, 'src/api/base44Client.js'), 'utf8');
    expect(clientSource).toContain('normalizeBase44FunctionResponse');
    expect(clientSource).toContain('client.functions.invoke = async');
  });

  it('keeps consolidated Admin status payloads below the Base44 response ceiling', () => {
    expect(source('getEuropeMarketsCommandCenter')).toContain('compactGrowthPayload');
    const runtimeSource = fs.readFileSync(path.join(root, 'base44/shared/goLiveRuntime.ts'), 'utf8');
    expect(runtimeSource).toContain('const compactDecision');
    expect(runtimeSource).toContain('open_incident_count:incidentRows.length');
    expect(runtimeSource).toContain('pending_approval_count:pendingApprovals.length');
    expect(runtimeSource).not.toContain('gates:decision.gates,');
  });
});
