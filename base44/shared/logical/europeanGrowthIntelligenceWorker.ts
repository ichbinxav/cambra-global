// AUDIT 2026-08-18 — moved out of base44/functions/europeanGrowthIntelligenceWorker/entry.ts. Host functions
// import this module directly: a relative import into another function's tree
// cannot be bundled, so every host of this logical route silently failed to
// deploy and kept serving stale code.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../internalGate.ts';
import { recomputeEuropeanMarketPortfolio } from '../growthPathRuntime.ts';
import { guardedScheduledServe } from '../schedulerRun.ts';

// Compatibility entrypoint for source archives. The deployed runtime routes the
// same bounded calculation through getEuropeMarketsCommandCenter so CAMBRA does
// not consume another Base44 function name.
guardedScheduledServe({"worker_key":"europeanGrowthIntelligenceWorker","cadence_seconds":86400},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({})); const gate = await requireAdminOrInternal(req,base44,body); if (!gate.ok) return gate.response;
    return Response.json({ ok:true,...await recomputeEuropeanMarketPortfolio(base44.asServiceRole) });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'european_growth_intelligence_failed' },{ status:500 }); }
});
