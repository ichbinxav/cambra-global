import {describe,it,expect} from 'vitest';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const json=(path)=>JSON.parse(read(path));

describe('v0.97 CTO production remediation controls',()=>{
  it('records all active Base44 schedules and proves a slot guard at every physical boundary',()=>{
    const inventory=json('config/scheduler-inventory.json');
    // COMMAND-C7 (2026-08-17): 69 -> 70 for the CAMBRA Command run sweep on
    // maintenanceEngine. Raised on purpose and never loosened into an inequality;
    // active and guarded both move with it, so an unguarded schedule still fails.
    expect(inventory.scheduled_automation_count).toBe(70);
    expect(inventory.active_count).toBe(68);
    expect(inventory.inactive_count).toBe(2);
    expect(inventory.unguarded_active).toEqual([]);
    const active=inventory.automations.filter((row)=>row.is_active);
    expect(active.every((row)=>row.protection_classification==='SLOT_GUARDED')).toBe(true);
    expect(active.every((row)=>row.lease_seconds===900)).toBe(true);
    // COMMAND-C7: 57 -> 58. The Command run sweep runs every 5 minutes and is
    // slot-guarded, so it is heartbeat-proven like every other periodic worker.
    expect(inventory.periodic_heartbeat_proven_count).toBe(58);
    expect(inventory.periodic_heartbeat_not_proven).toEqual([
      'alwaysOnLeadDiscoveryWorker',
      'autonomousPartnerWorker',
      'commercialFollowUpWorker',
      'eclLifecycleScheduler',
      'operatingHealthWorker',
      'outboundDeliverabilityManager',
      'outboundVolumeWorker',
      'postMeetingWorker',
      'processWebhookDeadLetters',
      'reconcileRecoverBilling',
    ]);
    expect(active.every((row)=>row.effect_boundary==='HANDLER_ENTRY_CONSERVATIVE')).toBe(true);
    expect(active.every((row)=>row.deadline_seconds==='UNKNOWN'&&row.timeout_seconds==='UNKNOWN')).toBe(true);
    expect(inventory.hard_deadline_unknown_count).toBe(68);
    expect(inventory.otr_005_status).toBe('PARTIAL');
    expect(inventory.inactive_automations.map((row)=>[row.worker_key,row.classification])).toEqual([
      ['autonomousCommercialWorker','INTENTIONALLY_DISABLED_COMPATIBILITY'],
      ['seedP3RateIntelligence','TEMPORARY_BOOTSTRAP_DISABLED'],
    ]);
    expect(inventory.automations.every((row)=>row.physical_host&&row.logical_worker&&row.responsibility)).toBe(true);
    expect(read('scripts/harden-scheduled-functions.mjs')).toContain('scheduled_boundary_unguarded');
    expect(read('scripts/harden-scheduled-functions.mjs')).toContain('scheduled_direct_claim_missing_effect_fence');
    const entries=fs.readdirSync('base44/functions',{withFileTypes:true})
      .filter((row)=>row.isDirectory())
      .map((row)=>`base44/functions/${row.name}/entry.ts`)
      .filter((path)=>fs.existsSync(path));
    expect(entries.filter((path)=>/^import \{\nimport /m.test(read(path)))).toEqual([]);
  });

  it('keeps unexpected backend diagnostics private and returns correlation ids',()=>{
    const helper=read('base44/shared/publicErrors.ts');
    expect(helper).toContain("error:'internal_error'");
    expect(helper).toContain('request_id:requestId');
    expect(helper).toContain("event:'internal_error'");
    expect(read('scripts/check-public-error-boundaries.mjs')).toContain('public-errors:check FAIL');
  });

  it('makes secondary fallbacks observable without granting effect authority',()=>{
    const helper=read('base44/shared/bestEffort.ts');
    expect(helper).toContain("metric:'best_effort_failure_total'");
    expect(helper).toContain('request_id:requestId');
    expect(helper).toContain('financial, legal or outbound effects');
    expect(read('scripts/harden-silent-failures.mjs')).toContain('unobservable null/empty-array catch fallback');
  });

  it('makes legacy admin bootstrap one-way after production initialization',()=>{
    const source=read('base44/functions/promoteMeToAdmin/entry.ts');
    expect(source).toContain("ADMIN_BOOTSTRAP_COMPLETE");
    expect(source).toContain("admin_bootstrap_complete");
    expect(source).toContain('status: 410');
  });

  it('can exercise the global stop with policies configured and restores the exact policy set',()=>{
    const source=read('base44/shared/logical/goLiveControlAdmin.ts');
    expect(source).not.toContain('outbound?.acquisition_enabled === true || activePolicies.length');
    expect(source).toContain('activePolicyIdsBefore');
    expect(source).toContain('active_policy_set_restored:policySetRestored');
  });

  it('identifies CAMBRA to GitHub for runtime repository and Dependabot checks',()=>{
    expect(read('base44/functions/developerMigrationEngine/entry.ts')).toMatch(/["']User-Agent["']\s*:\s*["']CAMBRA\/0\.97\.0["']/);
    const monitor=read('base44/functions/dependencySecurityWorker/entry.ts');
    expect(monitor).toContain('"User-Agent": "CAMBRA/0.97.0"');
    expect(monitor).toContain('p17:dependency_monitor_failed:');
    expect(monitor).toContain('isRecoveredMonitorFailure');
  });

  it('does not commit a self-referential parent SHA as release identity',()=>{
    const generator=read('scripts/generate-release-manifest.mjs');
    expect(generator).toContain('CAMBRA_RELEASE_GIT_SHA');
    expect(generator.indexOf('process.env.CAMBRA_RELEASE_GIT_SHA')).toBeLessThan(generator.indexOf('process.env.GITHUB_SHA'));
    expect(generator).not.toContain('git rev-parse HEAD');
    const workflow=read('.github/workflows/ci.yml');
    expect(workflow).toContain('CAMBRA_RELEASE_GIT_SHA: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(workflow).toContain('include-hidden-files: true');
    expect(workflow).toContain('npm run release:package');
  });

  it('states the exact frontend and critical-backend typecheck boundaries',()=>{
    const frontend=json('jsconfig.json');
    expect(frontend.include).toContain('src/api/**/*.js');
    expect(frontend.compilerOptions.allowJs).toBe(true);
    expect(frontend.compilerOptions.checkJs).toBe(true);
    const backend=json('tsconfig.critical.json');
    expect(backend.include).toContain('base44/shared/publicErrors.ts');
    expect(backend.include).toContain('base44/shared/schedulerRun.ts');
    expect(backend.include).toContain('base44/functions/promoteMeToAdmin/entry.ts');
    expect(read('src/docs/TYPECHECK_NOISE.md')).toContain('It is not described as a full-repository check');
  });

  it('gives scheduler execution evidence an exact central retention policy',()=>{
    const policy=read('base44/shared/retentionPolicy.ts');
    expect(policy).toContain("scheduler_runs:Object.freeze");
    expect(policy).toContain('retention_days:90');
    const row=json('config/data-retention-matrix.json').categories.find((item)=>item.category==='scheduler_runs');
    expect(row).toMatchObject({automation_status:'AUTOMATED',central_policy_key:'scheduler_runs'});
    expect(read('base44/functions/maintenanceEngine/entry.ts')).toContain('purgeExpiredSchedulerRuns');
  });
});
