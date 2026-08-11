import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { recomputeEuropeanMarketPortfolio } from '../../shared/growthPathRuntime.ts';

// Compatibility entrypoint for source archives. The deployed runtime routes the
// same bounded calculation through getEuropeMarketsCommandCenter so CAMBRA does
// not consume another Base44 function name.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({})); const gate = await requireAdminOrInternal(req,base44,body); if (!gate.ok) return gate.response;
    return Response.json({ ok:true,...await recomputeEuropeanMarketPortfolio(base44.asServiceRole) });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'european_growth_intelligence_failed' },{ status:500 }); }
});
