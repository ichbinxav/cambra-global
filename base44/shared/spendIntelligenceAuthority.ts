export class SpendIntelligenceAuthorityError extends Error {
  code: string;
  status: number;
  review_required: boolean;
  automatic_retry_blocked: boolean;

  constructor(code: string, status: number, reviewRequired = false) {
    super(code.toLowerCase());
    this.name = "SpendIntelligenceAuthorityError";
    this.code = code;
    this.status = status;
    this.review_required = reviewRequired;
    this.automatic_retry_blocked = reviewRequired;
  }
}

const clean = (value: unknown) => String(value ?? "").trim();
const SAFE_SOURCE_ID = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,159}$/;

function validCreatedAt(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function authorityError(source: string, suffix: string, status = 409) {
  return new SpendIntelligenceAuthorityError(
    `SPEND_INTELLIGENCE_${source.toUpperCase()}_${suffix}`,
    status,
    status === 409,
  );
}

/**
 * Select the newest row only when the `-created_date` authority is unique.
 * The caller intentionally requests two rows: equal timestamps, duplicate ids,
 * malformed rows, or an unexpected larger page are evidence of ambiguity, not
 * permission to pick whichever row happened to arrive first.
 */
export function selectUniqueLatestSpendSource(
  rows: unknown,
  source: string,
  expectedBrandId: unknown,
) {
  if (!Array.isArray(rows)) {
    throw authorityError(source, "AUTHORITY_UNAVAILABLE", 503);
  }
  if (rows.length === 0) return null;
  if (rows.length > 2) {
    throw authorityError(source, "AUTHORITY_AMBIGUOUS");
  }

  const brandId = clean(expectedBrandId);
  const normalized = rows.map((row: any) => ({
    row,
    id: clean(row?.id),
    brandId: clean(row?.brand_id),
    createdAt: validCreatedAt(row?.created_date),
  }));
  if (normalized.some((item) =>
    !item.row || typeof item.row !== "object" ||
    !SAFE_SOURCE_ID.test(item.id) ||
    !item.brandId || item.brandId !== brandId || item.createdAt === null
  )) {
    throw authorityError(source, "AUTHORITY_AMBIGUOUS");
  }
  if (normalized.length === 2) {
    if (
      normalized[0].id === normalized[1].id ||
      normalized[0].createdAt === normalized[1].createdAt
    ) {
      throw authorityError(source, "AUTHORITY_AMBIGUOUS");
    }
    normalized.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  }
  return normalized[0].row;
}

function stableProjection(value: any): any {
  if (Array.isArray(value)) return value.map(stableProjection);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableProjection(value[key])]),
  );
}

function sourceProjection(row: any, source: string) {
  const common = {
    id: clean(row?.id),
    brand_id: clean(row?.brand_id),
    created_date: clean(row?.created_date),
  };
  if (source === "discovery_task") {
    return stableProjection({
      ...common,
      agent_name: clean(row?.agent_name),
      status: clean(row?.status),
      output_hash: clean(row?.output_hash) || null,
      findings: row?.output_payload_json?.findings ?? null,
      source_coverage: row?.output_payload_json?.source_coverage ?? null,
    });
  }
  if (source === "analyzer_input") {
    return stableProjection({
      ...common,
      currency: row?.currency ?? null,
      monthly_revenue: row?.monthly_revenue ?? null,
      payment_provider: row?.payment_provider ?? null,
      shipping_provider: row?.shipping_provider ?? null,
      monthly_shipping_cost: row?.monthly_shipping_cost ?? null,
      monthly_shipments: row?.monthly_shipments ?? null,
      saas_tools: row?.saas_tools ?? null,
    });
  }
  throw authorityError(source, "AUTHORITY_AMBIGUOUS");
}

function assertSameSourceProjection(
  candidate: any,
  observed: any,
  source: string,
) {
  if (
    JSON.stringify(sourceProjection(candidate, source)) !==
      JSON.stringify(sourceProjection(observed, source))
  ) throw authorityError(source, "AUTHORITY_DRIFT");
}

async function revalidateSelectedSource(
  selected: any,
  source: string,
  expectedBrandId: unknown,
  resolveExact: (sourceId: string) => Promise<unknown>,
) {
  if (typeof resolveExact !== "function") {
    throw authorityError(source, "AUTHORITY_UNAVAILABLE", 503);
  }
  const exact: any = await resolveExact(clean(selected.id));
  if (
    !exact || typeof exact !== "object" ||
    clean(exact.id) !== clean(selected.id) ||
    clean(exact.brand_id) !== clean(expectedBrandId)
  ) throw authorityError(source, "BRAND_BINDING_INVALID");
  if (source === "discovery_task" &&
    (clean(exact.agent_name) !== "discovery_tech_stack" ||
      clean(exact.status) !== "completed")) {
    throw authorityError(source, "BRAND_BINDING_INVALID");
  }
  assertSameSourceProjection(selected, exact, source);
  return exact;
}

/**
 * A filtered latest-task read is only a candidate. Re-read that exact id through
 * the canonical task authority and validate the returned snapshot before use.
 */
export async function selectAndRevalidateLatestDiscoveryTask(
  rows: unknown,
  expectedBrandId: unknown,
  resolveExact: (taskId: string) => Promise<unknown>,
) {
  const selected: any = selectUniqueLatestSpendSource(
    rows,
    "discovery_task",
    expectedBrandId,
  );
  if (!selected) return null;
  return revalidateSelectedSource(
    selected,
    "discovery_task",
    expectedBrandId,
    resolveExact,
  );
}

export async function selectAndRevalidateLatestAnalyzerInput(
  rows: unknown,
  expectedBrandId: unknown,
  resolveExact: (inputId: string) => Promise<unknown>,
) {
  const selected: any = selectUniqueLatestSpendSource(
    rows,
    "analyzer_input",
    expectedBrandId,
  );
  if (!selected) return null;
  return revalidateSelectedSource(
    selected,
    "analyzer_input",
    expectedBrandId,
    resolveExact,
  );
}

/**
 * Final optimistic fence, called immediately before the success task write.
 * It proves that the exact projection consumed above is still the unique latest
 * source observed by the datastore. Without a transactional datastore claim we
 * deliberately describe this as a revalidated observation, not immutable
 * latest authority.
 */
export async function revalidateLatestSpendSourceFence(
  selected: any,
  source: string,
  expectedBrandId: unknown,
  resolveLatest: () => Promise<unknown>,
) {
  if (typeof resolveLatest !== "function") {
    throw authorityError(source, "AUTHORITY_UNAVAILABLE", 503);
  }
  let rows: unknown;
  try {
    rows = await resolveLatest();
  } catch {
    throw authorityError(source, "AUTHORITY_UNAVAILABLE", 503);
  }
  const latest: any = selectUniqueLatestSpendSource(
    rows,
    source,
    expectedBrandId,
  );
  if (!latest || clean(latest.id) !== clean(selected?.id)) {
    throw authorityError(source, "LATEST_CHANGED");
  }
  if (source === "discovery_task" &&
    (clean(latest.agent_name) !== "discovery_tech_stack" ||
      clean(latest.status) !== "completed")) {
    throw authorityError(source, "BRAND_BINDING_INVALID");
  }
  assertSameSourceProjection(selected, latest, source);
  return latest;
}

/** Resolve an explicitly supplied AnalyzerInput without silently falling back. */
export function selectExactSpendSource(
  rows: unknown,
  source: string,
  expectedId: unknown,
  expectedBrandId: unknown,
) {
  if (!Array.isArray(rows)) {
    throw authorityError(source, "AUTHORITY_UNAVAILABLE", 503);
  }
  if (rows.length !== 1) {
    throw authorityError(
      source,
      rows.length > 1 ? "AUTHORITY_AMBIGUOUS" : "BRAND_BINDING_INVALID",
    );
  }
  const row: any = rows[0];
  if (
    !SAFE_SOURCE_ID.test(clean(expectedId)) ||
    clean(row?.id) !== clean(expectedId) ||
    clean(row?.brand_id) !== clean(expectedBrandId)
  ) {
    throw authorityError(source, "BRAND_BINDING_INVALID");
  }
  return row;
}
