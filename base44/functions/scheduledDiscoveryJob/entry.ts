import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M7 — scheduledDiscoveryJob
 *
 * Runs continuous discovery for ALL brands on a schedule.
 * Admin / scheduler only. Regular users get 403.
 *
 * - Loads all Brand records.
 * - Sequentially invokes runContinuousDiscovery(trigger='scheduled') per brand.
 * - 500ms delay between brands to avoid overload.
 * - Skips brands that already had a scheduled run in the last 24h.
 */

const SKIP_WINDOW_MS = 24 * 60 * 60 * 1000;
const DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin or service-role only
  let isServiceRole = false;
  let user = null;
  try {
    user = await base44.auth.me();
  } catch (_) {
    isServiceRole = true;
  }
  if (!isServiceRole) {
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Forbidden — admin or scheduler only' }, { status: 403 });
    }
  }

  const svc = base44.asServiceRole;

  const brands = await svc.entities.Brand.list('-created_date', 1000).catch(() => []);
  const now = Date.now();
  const cutoffIso = new Date(now - SKIP_WINDOW_MS).toISOString();

  let brands_processed = 0;
  let brands_skipped = 0;
  let total_changes_detected = 0;
  const errors = [];

  for (const b of brands) {
    try {
      // Skip if a scheduled run already happened in the last 24h
      const recentScheduled = await svc.entities.ContinuousDiscoveryRun.filter({
        brand_id: b.id,
        trigger: 'scheduled',
        started_at: { $gte: cutoffIso },
      }, '-started_at', 1).catch(() => []);

      if (recentScheduled.length > 0) {
        brands_skipped++;
        continue;
      }

      const res = await svc.functions.invoke('runContinuousDiscovery', {
        brand_id: b.id,
        trigger: 'scheduled',
      });
      const payload = res?.data || res;
      if (payload?.ok) {
        brands_processed++;
        total_changes_detected += Number(payload.changes_detected || 0);
      } else {
        errors.push(`${b.id}: ${payload?.error || 'unknown'}`);
      }
    } catch (e) {
      errors.push(`${b.id}: ${e?.message || String(e)}`);
    }

    await sleep(DELAY_MS);
  }

  const summary = {
    ok: true,
    brands_processed,
    brands_skipped,
    total_changes_detected,
    errors_count: errors.length,
  };
  console.log('[scheduledDiscoveryJob] summary:', JSON.stringify(summary));
  if (errors.length) console.warn('[scheduledDiscoveryJob] errors sample:', errors.slice(0, 5));

  return Response.json(summary);
});