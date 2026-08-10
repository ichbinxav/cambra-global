import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * Discovery / Tech Stack Agent — Brain B1
 *
 * Design principle: deterministic detection FIRST, AI interprets AFTER.
 * The agent NEVER invents tools. Claude only classifies and reasons over
 * what the deterministic scanner has already detected.
 *
 * Flow:
 *   1. Call `discoverCompanyInfrastructure` (existing deterministic scanner)
 *      → returns raw findings (tool, category, evidence, confidence).
 *   2. Cross-reference each finding with IntegrationCatalog → matched_catalog_id.
 *   3. If ANTHROPIC_API_KEY is set: Claude takes the findings and produces
 *      an interpretation (vertical bucket, refined confidence, reasoning).
 *      Claude is explicitly forbidden from adding tools that aren't in the
 *      detected list. If key is missing, raw findings are still returned
 *      with a note — partial success, not failure.
 *   4. Write an AgentTask (L1, no Approval) so it appears in Activity Log.
 *
 * Payload: { website_url: string, brand_id: string }
 * Returns: { ok, task_id, job_id, findings: [...], summary, interpretation_status }
 */

const AGENT_NAME = "discovery_tech_stack";
const TASK_TYPE = "discover_tech_stack";
const RISK_LEVEL = 1;

// CAMBRA verticals — Claude must classify into one of these or "other"
const CAMBRA_VERTICALS = [
  "payments", "shipping", "saas_commerce", "saas_marketing",
  "saas_analytics", "saas_support", "saas_finance", "saas_hr", "other",
];

// Category → CAMBRA vertical map (deterministic, no AI)
const CATEGORY_TO_VERTICAL = {
  payment_provider: "payments",
  shipping: "shipping",
  commerce_platform: "saas_commerce",
  marketing: "saas_marketing",
  analytics: "saas_analytics",
  support: "saas_support",
  finance: "saas_finance",
  hr: "saas_hr",
  other: "other",
};

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5',
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// Light fuzzy matcher: case-insensitive contains, normalizes punctuation
function matchCatalog(toolName, catalogIndex) {
  if (!toolName) return null;
  const norm = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (catalogIndex.byNorm[norm]) return catalogIndex.byNorm[norm];
  // Substring fallback
  for (const entry of catalogIndex.list) {
    if (entry.norm && norm.includes(entry.norm) && entry.norm.length >= 4) return entry;
    if (entry.norm && entry.norm.includes(norm) && norm.length >= 4) return entry;
  }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { website_url, brand_id } = body;
    if (!brand_id) return Response.json({ ok: false, error: "Missing brand_id" }, { status: 400 });
    if (!website_url) return Response.json({ ok: false, error: "Missing website_url" }, { status: 400 });

    // Open AgentTask (L1, no Approval) — visible in Activity Log
    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Tech stack discovery for ${website_url}`,
      started_at: new Date().toISOString(),
    });

    // ── 1. Deterministic detection ────────────────────────────────────────
    // Reuse the existing scanner — single source of truth, no duplication.
    const discoveryRes = await base44.functions.invoke("discoverCompanyInfrastructure", {
      website_url,
      brand_id,
    });
    const discoveryPayload = discoveryRes?.data || discoveryRes;
    if (!discoveryPayload?.ok) {
      const err = discoveryPayload?.error || "Discovery scanner failed";
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "failed",
        error: err,
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, error: err, task_id: task.id, job_id: discoveryPayload?.job_id || null });
    }
    const rawFindings = Array.isArray(discoveryPayload.findings) ? discoveryPayload.findings : [];

    // Load full DiscoveryFinding rows for this job to recover evidence_value
    const jobId = discoveryPayload.job_id;
    const findingRows = jobId
      ? await base44.asServiceRole.entities.DiscoveryFinding
          .filter({ discovery_job_id: jobId }, "-created_date", 200)
          .catch(() => [])
      : [];

    // ── 2. Cross-reference with IntegrationCatalog ────────────────────────
    const catalog = await base44.asServiceRole.entities.IntegrationCatalog
      .list("-priority", 500)
      .catch(() => []);
    const catalogIndex = {
      list: catalog.map(c => ({
        id: c.id,
        integration_id: c.integration_id,
        name: c.name,
        category: c.category,
        norm: (c.name || "").toLowerCase().replace(/[^a-z0-9]+/g, ""),
      })),
      byNorm: {},
    };
    for (const e of catalogIndex.list) {
      if (e.norm) catalogIndex.byNorm[e.norm] = e;
    }

    // Merge raw scanner output with the persisted finding rows so we keep
    // the evidence trail (evidence_type + evidence_value).
    const enriched = rawFindings.map(f => {
      const row = findingRows.find(r =>
        r.provider_or_tool === f.provider_or_tool && r.category === f.category
      );
      const cat = matchCatalog(f.provider_or_tool, catalogIndex);
      return {
        tool: f.provider_or_tool,
        category: f.category,
        vertical: CATEGORY_TO_VERTICAL[f.category] || "other",
        confidence: f.confidence_score,
        evidence_type: f.evidence_type || row?.evidence_type || null,
        evidence_value: row?.evidence_value || null,
        detection_method: row?.detection_method || null,
        source: "deterministic_scanner",
        matched_catalog_id: cat?.id || null,
        matched_catalog_integration_id: cat?.integration_id || null,
        matched_catalog_name: cat?.name || null,
      };
    });

    // ── 3. AI interpretation (Claude) — non-blocking ──────────────────────
    let interpretation = null;
    let interpretation_status = "skipped_no_key";
    const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");

    if (hasKey && enriched.length > 0) {
      // Strict prompt: Claude can ONLY operate on the listed tools.
      // No new tools, no guessing. It assigns: refined confidence (high/medium/low),
      // reasoning, and a 1-line summary per tool — using only the evidence given.
      const allowedTools = enriched.map(e => e.tool);
      const prompt = [
        "You are CAMBRA's tech stack interpreter.",
        "",
        "STRICT RULES — VIOLATIONS WILL BE REJECTED:",
        "1. You may ONLY reference tools from this exact list:",
        "   " + JSON.stringify(allowedTools),
        "2. NEVER invent, infer, or add tools that are not in this list.",
        "3. If a piece of evidence is ambiguous, mark confidence as 'low' — do NOT guess.",
        "4. Your output is interpretation of detected signals, NOT new detection.",
        "",
        "For each tool, output:",
        "  - tool: exact name from the list",
        "  - confidence: 'high' | 'medium' | 'low' (based ONLY on the evidence shown)",
        "  - reasoning: 1-2 lines explaining what the evidence tells us",
        "",
        "Also output a `summary` field: 2-3 lines plain language describing the overall stack.",
        "",
        "Allowed CAMBRA verticals (for reference, do not reassign — already done deterministically):",
        "  " + JSON.stringify(CAMBRA_VERTICALS),
        "",
        "Return ONLY JSON with shape:",
        '{ "summary": "<string>", "interpretations": [{ "tool": "<string>", "confidence": "<high|medium|low>", "reasoning": "<string>" }] }',
        "",
        "DETECTED SIGNALS:",
        JSON.stringify(enriched.map(e => ({
          tool: e.tool,
          vertical: e.vertical,
          evidence_type: e.evidence_type,
          evidence_value: e.evidence_value,
          scanner_confidence: e.confidence,
        })), null, 2),
      ].join("\n");

      try {
        const text = await callClaude(prompt);
        const parsed = safeParseJSON(text);
        if (parsed) {
          // Hard validation: drop any interpretation that references an
          // unknown tool (defense in depth against hallucination).
          const allowedSet = new Set(allowedTools);
          const cleanInterpretations = Array.isArray(parsed.interpretations)
            ? parsed.interpretations.filter(i => i && allowedSet.has(i.tool))
            : [];
          interpretation = {
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            interpretations: cleanInterpretations,
          };
          interpretation_status = cleanInterpretations.length > 0 ? "ok" : "empty_after_validation";

          // Merge interpretation into enriched
          for (const e of enriched) {
            const i = cleanInterpretations.find(x => x.tool === e.tool);
            if (i) {
              e.ai_confidence = i.confidence;
              e.ai_reasoning = i.reasoning;
            }
          }
        } else {
          interpretation_status = "parse_failed";
        }
      } catch (claudeErr) {
        interpretation_status = `error: ${claudeErr.message}`;
      }
    } else if (!hasKey) {
      interpretation_status = "skipped_no_key";
    } else {
      interpretation_status = "skipped_no_findings";
    }

    // ── 4. Persist task output ────────────────────────────────────────────
    const detectedSummary = enriched.length === 0
      ? "No signals detected on the public site."
      : `Detected ${enriched.length} tool(s) across ${new Set(enriched.map(e => e.vertical)).size} vertical(s).`;

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: detectedSummary,
      output_payload_json: {
        website_url,
        job_id: jobId,
        findings: enriched,
        interpretation,
        interpretation_status,
        engine: {
          deterministic: "discoverCompanyInfrastructure",
          interpreter: hasKey ? "anthropic/claude-sonnet-4-5" : "none",
        },
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      job_id: jobId,
      findings: enriched,
      summary: interpretation?.summary || detectedSummary,
      interpretation_status,
    });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});