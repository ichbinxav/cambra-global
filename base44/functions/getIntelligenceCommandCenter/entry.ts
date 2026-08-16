import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { validateStoredIntelligenceRecord } from "../../shared/intelligenceTenantScope.ts";

type SourceRead = {
  status: "COMPLETE" | "PARTIAL_LIMIT_REACHED" | "UNAVAILABLE";
  complete: boolean;
  rows: any[];
  limit: number;
};

async function readSource(
  operation: string,
  limit: number,
  read: () => Promise<unknown>,
): Promise<SourceRead> {
  try {
    const rows = await read();
    if (!Array.isArray(rows)) throw new Error("invalid_source_response");
    const complete = rows.length < limit;
    return {
      status: complete ? "COMPLETE" : "PARTIAL_LIMIT_REACHED",
      complete,
      rows,
      limit,
    };
  } catch (error) {
    safeBestEffort(error, {
      operation: `getIntelligenceCommandCenter.${operation}`,
      fallback: null,
      severity: "secondary",
    });
    return { status: "UNAVAILABLE", complete: false, rows: [], limit };
  }
}

const countWhenReadable = (source: SourceRead, value: number) =>
  source.status === "UNAVAILABLE" ? null : value;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((error: any) =>
    safeBestEffort(error, {
      operation: "getIntelligenceCommandCenter.auth",
      fallback: null,
      severity: "secondary",
    })
  );
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const service = base44.asServiceRole;
  const [pricingRead, evidenceRead, claimRead, conflictRead, outcomeRead, moatRead, gapRead] =
    await Promise.all([
      readSource("pricing", 1000, () =>
        service.entities.ProviderPricingVersion.list("-observed_at", 1000)),
      readSource("evidence", 1000, () =>
        service.entities.IntelligenceEvidence.list("-recorded_at", 1000)),
      readSource("claims", 1000, () =>
        service.entities.KnowledgeClaim.list("-created_date", 1000)),
      readSource("conflicts", 200, () =>
        service.entities.KnowledgeConflict.filter(
          { status: { $in: ["open", "investigating"] } },
          "-created_at",
          200,
        )),
      readSource("outcomes", 1000, () =>
        service.entities.IntelligenceOutcome.list("-captured_at", 1000)),
      readSource("moat", 500, () =>
        service.entities.MoatMetric.list("-moat_score", 500)),
      readSource("gaps", 100, () =>
        service.entities.KnowledgeGap.filter(
          { status: "open" },
          "-information_value",
          100,
        )),
    ]);

  const pricing = pricingRead.rows;
  const evidence = evidenceRead.rows.filter((row: any) =>
    row.quarantined !== true &&
    validateStoredIntelligenceRecord(row, "evidence").ok
  );
  const claims = claimRead.rows.filter((row: any) =>
    row.knowledge_state !== "quarantined" &&
    validateStoredIntelligenceRecord(row, "claim").ok
  );
  const outcomes = outcomeRead.rows.filter((row: any) =>
    row.quarantined !== true &&
    validateStoredIntelligenceRecord(row, "outcome").ok
  );
  const official = pricing.filter((row: any) =>
    row.truth_level === "verified_official"
  ).length;
  const stale = pricing.filter((row: any) =>
    Date.now() - Date.parse(row.observed_at || "") > 90 * 86_400_000
  ).length;
  const scopeReadsAvailable = [evidenceRead, claimRead, outcomeRead].every(
    (source) => source.status !== "UNAVAILABLE",
  );
  const sourceHealth = Object.fromEntries(
    Object.entries({
      pricing: pricingRead,
      evidence: evidenceRead,
      claims: claimRead,
      conflicts: conflictRead,
      outcomes: outcomeRead,
      moat: moatRead,
      gaps: gapRead,
    }).map(([key, value]) => [key, {
      status: value.status,
      complete: value.complete,
      returned_rows: value.rows.length,
      limit: value.limit,
    }]),
  );
  const degraded = Object.values(sourceHealth).some((source: any) =>
    source.status !== "COMPLETE"
  );

  return Response.json({
    ok: true,
    degraded,
    generated_at: new Date().toISOString(),
    source_health: sourceHealth,
    metrics: {
      providers_tracked: countWhenReadable(
        pricingRead,
        new Set(pricing.map((row: any) => row.provider_slug)).size,
      ),
      pricing_records: countWhenReadable(pricingRead, pricing.length),
      official_verified_pct: pricingRead.status === "UNAVAILABLE" ||
          pricing.length === 0
        ? null
        : Math.round(official / pricing.length * 100),
      evidence: countWhenReadable(evidenceRead, evidence.length),
      knowledge_claims: countWhenReadable(claimRead, claims.length),
      open_conflicts: countWhenReadable(conflictRead, conflictRead.rows.length),
      outcomes: countWhenReadable(outcomeRead, outcomes.length),
      quarantined_or_scope_ambiguous: scopeReadsAvailable
        ? evidenceRead.rows.length - evidence.length +
          claimRead.rows.length - claims.length +
          outcomeRead.rows.length - outcomes.length
        : null,
      stale_pricing: countWhenReadable(pricingRead, stale),
      high_value_gaps: countWhenReadable(
        gapRead,
        gapRead.rows.filter((row: any) =>
          Number(row.information_value || 0) >= 35
        ).length,
      ),
    },
    pricing: pricing.slice(0, 100),
    conflicts: conflictRead.rows.slice(0, 50),
    moat: moatRead.rows.slice(0, 100),
    gaps: gapRead.rows.slice(0, 50),
    recent_outcomes: outcomes.slice(0, 50),
  });
});
