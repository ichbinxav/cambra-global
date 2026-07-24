import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requireUserOrInternal } from '../../shared/internalGate.ts';

/**
 * M7 — runContinuousDiscovery
 *
 * Runs a full continuous discovery cycle for a single brand.
 *
 * Steps (each non-blocking — failure of one does not stop the others):
 *   1. Re-run website discovery (public signals only) + mark stale findings.
 *   2. Refresh infrastructure graph (buildInfrastructureGraph).
 *   3. Refresh benchmarks via benchmarkLearningEngine on the latest result (<90d).
 *   4. Detect stack changes vs previous run — mark missing nodes as inactive.
 *   5. Infer vendors from Stripe payment data (inferVendorsFromBankData).
 *
 * Auth: caller must own the brand. Admin & service role bypass ownership check.
 */

const ENGINE_VERSION = 'm7-continuous-discovery-1.0';
const STALE_DAYS = 30;
const BENCHMARK_FRESH_DAYS = 90;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let body = {};
  try { body = await req.json(); } catch (_) { /* empty body ok */ }

  const { brand_id, trigger = 'manual' } = body || {};
  if (!brand_id) {
    return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
  }

  // SECURITY-2 (2026-07-24) — an auth FAILURE never grants privilege (the old
  // catch set isServiceRole=true, the same conceptual error as the inverted
  // gate). Authenticated user (owner-checked) OR INTERNAL_CALL_SECRET.
  const gate = await requireUserOrInternal(req, base44, null);
  if (!gate.ok) return gate.response;
  const user = gate.user;
  const isAdmin = gate.isAdmin;
  if (!gate.isInternal && !isAdmin) {
    const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
    if (!owned.length) {
      return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const svc = base44.asServiceRole;
  const startedAt = new Date().toISOString();

  // Create the run record
  const run = await svc.entities.ContinuousDiscoveryRun.create({
    brand_id,
    trigger,
    status: 'running',
    started_at: startedAt,
    changes_detected: 0,
    nodes_updated: 0,
    benchmarks_refreshed: 0,
    engine_version: ENGINE_VERSION,
  });

  let changes_detected = 0;
  let nodes_updated = 0;
  let benchmarks_refreshed = 0;
  const stepErrors = [];

  // ── STEP 1: Re-run website discovery ──────────────────────────
  try {
    const memories = await svc.entities.CompanyMemory
      .filter({ brand_id }, '-created_date', 1).catch(() => []);
    const websiteUrl = memories[0]?.website_url;

    if (websiteUrl) {
      // Snapshot existing findings BEFORE discovery, for diffing
      const existingFindings = await svc.entities.DiscoveryFinding
        .filter({ brand_id }).catch(() => []);
      const existingKeys = new Set(
        existingFindings.map(f => `${f.category}|${(f.provider_or_tool || '').toLowerCase()}`)
      );

      const discoverRes = await base44.functions.invoke('discoverCompanyInfrastructure', {
        website_url: websiteUrl,
        brand_id,
      }).catch((e) => { throw new Error('discoverCompanyInfrastructure: ' + (e?.message || e)); });
      const payload = discoverRes?.data || discoverRes;
      const newFindings = payload?.findings || [];

      // Count truly new provider detections
      for (const f of newFindings) {
        const key = `${f.category}|${(f.provider_or_tool || '').toLowerCase()}`;
        if (!existingKeys.has(key)) changes_detected++;
      }

      // Mark stale findings (older than STALE_DAYS, status still 'detected', not re-confirmed this run)
      const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
      const newKeys = new Set(
        newFindings.map(f => `${f.category}|${(f.provider_or_tool || '').toLowerCase()}`)
      );
      for (const f of existingFindings) {
        if (f.status !== 'detected') continue;
        const seenAt = new Date(f.created_date || f.created_at || 0).getTime();
        if (seenAt && seenAt < staleCutoff) {
          const key = `${f.category}|${(f.provider_or_tool || '').toLowerCase()}`;
          if (!newKeys.has(key)) {
            await svc.entities.DiscoveryFinding.update(f.id, { status: 'stale' }).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    stepErrors.push('step1_discovery: ' + (e?.message || String(e)));
  }

  // ── STEP 2: Refresh infrastructure graph ──────────────────────
  try {
    const graphRes = await base44.functions.invoke('buildInfrastructureGraph', { brand_id })
      .catch((e) => { throw new Error('buildInfrastructureGraph: ' + (e?.message || e)); });
    const gp = graphRes?.data || graphRes;
    if (gp?.ok) {
      nodes_updated += Number(gp.nodes_created || 0) + Number(gp.nodes_updated || 0);
    }
  } catch (e) {
    stepErrors.push('step2_graph: ' + (e?.message || String(e)));
  }

  // ── STEP 3: Refresh benchmarks ───────────────────────────────
  try {
    const latest = await svc.entities.AnalyzerResult
      .filter({ brand_id }, '-created_date', 1).catch(() => []);
    const lr = latest[0];
    if (lr) {
      const createdMs = new Date(lr.created_date || 0).getTime();
      const fresh = createdMs && (Date.now() - createdMs) < BENCHMARK_FRESH_DAYS * 24 * 60 * 60 * 1000;
      if (fresh) {
        const benchRes = await base44.functions.invoke('benchmarkLearningEngine', { resultId: lr.id, internal_secret: Deno.env.get('INTERNAL_CALL_SECRET') || '' })
          .catch((e) => { throw new Error('benchmarkLearningEngine: ' + (e?.message || e)); });
        const bp = benchRes?.data || benchRes;
        if (bp?.ok !== false) benchmarks_refreshed = 1;
      }
    }
  } catch (e) {
    stepErrors.push('step3_benchmarks: ' + (e?.message || String(e)));
  }

  // ── STEP 4: Detect stack changes vs previous run ─────────────
  try {
    // Previous COMPLETED run (not the one we just created)
    const prevRuns = await svc.entities.ContinuousDiscoveryRun
      .filter({ brand_id, status: 'completed' }, '-completed_at', 1).catch(() => []);
    const previousRunAt = prevRuns[0]?.completed_at ? new Date(prevRuns[0].completed_at).getTime() : null;

    const currentNodes = await svc.entities.InfrastructureNode
      .filter({ brand_id }).catch(() => []);

    if (previousRunAt) {
      // New node = first_detected_at after previous run
      for (const n of currentNodes) {
        const detectedMs = new Date(n.first_detected_at || n.created_date || 0).getTime();
        if (detectedMs && detectedMs > previousRunAt) changes_detected++;
      }
      // Inactive node = not re-verified in this run window (last_verified_at older than this run start)
      const thisRunStart = new Date(startedAt).getTime();
      for (const n of currentNodes) {
        if (n.status === 'inactive') continue;
        const verifiedMs = new Date(n.last_verified_at || 0).getTime();
        if (verifiedMs && verifiedMs < thisRunStart) {
          await svc.entities.InfrastructureNode.update(n.id, { status: 'inactive' }).catch(() => {});
          changes_detected++;
        }
      }
    }
  } catch (e) {
    stepErrors.push('step4_stack_changes: ' + (e?.message || String(e)));
  }

  // ── STEP 5: Infer vendors from Stripe payment data ───────────
  // Non-blocking — gracefully returns reason if no StripeConnection.
  try {
    const inferRes = await base44.functions.invoke('inferVendorsFromBankData', { brand_id, internal_secret: Deno.env.get('INTERNAL_CALL_SECRET') || '' })
      .catch((e) => { throw new Error('inferVendorsFromBankData: ' + (e?.message || e)); });
    const ip = inferRes?.data || inferRes;
    if (ip?.ok) {
      nodes_updated += Number(ip.nodes_created || 0) + Number(ip.nodes_updated || 0);
      changes_detected += Number(ip.nodes_created || 0);
    }
  } catch (e) {
    stepErrors.push('step5_vendor_inference: ' + (e?.message || String(e)));
  }

  // Finalize run
  const completedAt = new Date().toISOString();
  const finalStatus = stepErrors.length === 0
    ? 'completed'
    : (stepErrors.length >= 5 ? 'failed' : 'partial');

  await svc.entities.ContinuousDiscoveryRun.update(run.id, {
    status: finalStatus,
    completed_at: completedAt,
    changes_detected,
    nodes_updated,
    benchmarks_refreshed,
    error_message: stepErrors.length ? stepErrors.join(' | ').slice(0, 1000) : undefined,
  }).catch(() => {});

  return Response.json({
    ok: true,
    run_id: run.id,
    status: finalStatus,
    changes_detected,
    nodes_updated,
    benchmarks_refreshed,
    step_errors: stepErrors,
  });
});