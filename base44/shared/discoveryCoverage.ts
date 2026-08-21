export const DISCOVERY_SOURCE_SCOPE = "PRIMARY_DOCUMENT_HTTPS_RESPONSE";
export const DISCOVERY_SOURCE_SCANNER = "discoverCompanyInfrastructure";

type DiscoveryCoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";

const EVIDENCE_STRENGTH: Record<string, number> = Object.freeze({
  header: 5,
  script_tag: 4,
  meta_tag: 3,
  script_or_body: 2,
  body_text: 1,
});

function findingIdentity(finding: any) {
  return `${String(finding?.category || "").trim().toLowerCase()}\0${
    String(finding?.provider_or_tool || "").trim().toLowerCase()
  }`;
}

function findingStrength(finding: any) {
  const confidence = typeof finding?.confidence_score === "number" &&
      Number.isFinite(finding.confidence_score)
    ? finding.confidence_score
    : -1;
  const evidence = EVIDENCE_STRENGTH[String(finding?.evidence_type || "")] || 0;
  return { confidence, evidence };
}

/**
 * One tool/category is one scanner finding. Prefer the higher confidence, then
 * the stronger evidence class; an exact tie is broken by a lexical projection
 * so the result is independent of detector declaration/input order.
 */
export function dedupeDiscoveryFindings(findings: unknown) {
  if (!Array.isArray(findings)) return [];
  const selected = new Map<string, any>();
  for (const finding of findings) {
    if (!finding || typeof finding !== "object") continue;
    const identity = findingIdentity(finding);
    if (identity === "\0") continue;
    const current = selected.get(identity);
    if (!current) {
      selected.set(identity, finding);
      continue;
    }
    const nextStrength = findingStrength(finding);
    const currentStrength = findingStrength(current);
    const nextTie = JSON.stringify({
      evidence_type: finding.evidence_type || null,
      evidence_value: finding.evidence_value || null,
      detection_method: finding.detection_method || null,
    });
    const currentTie = JSON.stringify({
      evidence_type: current.evidence_type || null,
      evidence_value: current.evidence_value || null,
      detection_method: current.detection_method || null,
    });
    if (
      nextStrength.confidence > currentStrength.confidence ||
      (nextStrength.confidence === currentStrength.confidence &&
        nextStrength.evidence > currentStrength.evidence) ||
      (nextStrength.confidence === currentStrength.confidence &&
        nextStrength.evidence === currentStrength.evidence &&
        nextTie.localeCompare(currentTie, "en") < 0)
    ) selected.set(identity, finding);
  }
  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([, finding]) => finding);
}

function supportedHtmlContentType(value: unknown) {
  if (typeof value !== "string") return false;
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return mime === "text/html" || mime === "application/xhtml+xml";
}

export function isEligibleDiscoveryHttpResponse(
  status: unknown,
  contentType: unknown,
) {
  return Number.isSafeInteger(status) && Number(status) >= 200 &&
    Number(status) < 300 && supportedHtmlContentType(contentType);
}

/**
 * Normalize the deterministic scanner receipt before B1 persists it. A B1
 * task may claim COMPLETE only when the scanner identity, scope, row count and
 * non-truncated body are all explicit and mutually consistent. Empty or
 * malformed receipts remain UNKNOWN; a consistent partial receipt remains
 * PARTIAL.
 */
export function normalizeDiscoveryTaskSourceCoverage(
  rawCoverage: unknown,
  findingCount: number,
) {
  const coverage = rawCoverage && typeof rawCoverage === "object" &&
      !Array.isArray(rawCoverage)
    ? rawCoverage as Record<string, unknown>
    : {};
  const safeFindingCount = Number.isSafeInteger(findingCount) && findingCount >= 0
    ? findingCount
    : 0;
  const identityObserved =
    coverage.scope === DISCOVERY_SOURCE_SCOPE &&
    coverage.scanner === DISCOVERY_SOURCE_SCANNER;
  const countMatches = Number.isSafeInteger(coverage.finding_count) &&
    coverage.finding_count === safeFindingCount;
  const httpEligible = isEligibleDiscoveryHttpResponse(
    coverage.http_status,
    coverage.content_type,
  );

  let discoveryCoverageStatus: DiscoveryCoverageStatus = "UNKNOWN";
  if (safeFindingCount > 0 && identityObserved && countMatches) {
    if (
      coverage.status === "COMPLETE" &&
      coverage.body_truncated === false &&
      coverage.body_eof_observed === true &&
      httpEligible
    ) {
      discoveryCoverageStatus = "COMPLETE";
    } else if (coverage.status === "PARTIAL") {
      discoveryCoverageStatus = "PARTIAL";
    }
  }

  return {
    discovery_coverage_status: discoveryCoverageStatus,
    scope: identityObserved ? DISCOVERY_SOURCE_SCOPE : "UNKNOWN",
    scanner: identityObserved ? DISCOVERY_SOURCE_SCANNER : "unknown",
    engine_version: coverage.engine_version === "1.0.0" ? "1.0.0" : "unknown",
    body_truncated: typeof coverage.body_truncated === "boolean"
      ? coverage.body_truncated
      : null,
    body_eof_observed: typeof coverage.body_eof_observed === "boolean"
      ? coverage.body_eof_observed
      : null,
    http_status: Number.isSafeInteger(coverage.http_status)
      ? coverage.http_status
      : null,
    content_type: typeof coverage.content_type === "string" &&
        coverage.content_type.length <= 160
      ? coverage.content_type
      : null,
    finding_count: safeFindingCount,
  };
}
