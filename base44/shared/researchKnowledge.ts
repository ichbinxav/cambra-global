import {
  RESEARCH_KNOWLEDGE_CHUNKS,
  RESEARCH_KNOWLEDGE_DOCUMENTS,
} from "./generated/researchKnowledgeDocuments.ts";
// AUDIT 2026-08-18 — the canonical JSON lives in config/, which the Base44
// function bundler cannot reach from inside a function tree; the generated
// artifact carries the identical bytes and is drift-gated.
import {
  RESEARCH_KNOWLEDGE_CATALOG,
  RESEARCH_KNOWLEDGE_CONFLICTS,
} from "./generated/researchKnowledgeConfig.ts";

export const RESEARCH_KNOWLEDGE_RETRIEVAL_VERSION =
  "research-knowledge-retrieval.v1";

const MAX_QUERY_CHARACTERS = 1_000;
const MAX_FILTER_VALUES = 24;
const MAX_FILTER_VALUE_CHARACTERS = 120;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_RESULT_TEXT_CHARACTERS = 1_800;
const MAX_CONTEXT_CHARACTERS = 12_000;
const DEFAULT_STALE_AFTER_DAYS = 365;

const STOP_WORDS = new Set([
  "a",
  "al",
  "and",
  "con",
  "de",
  "del",
  "des",
  "du",
  "el",
  "en",
  "et",
  "for",
  "from",
  "la",
  "las",
  "le",
  "les",
  "los",
  "of",
  "para",
  "par",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

const OFFICIAL_HOSTS = new Set([
  "acpr.banque-france.fr",
  "banque-france.fr",
  "boe.es",
  "cnil.fr",
  "docs.adyen.com",
  "docs.stripe.com",
  "eba.europa.eu",
  "ec.europa.eu",
  "eur-lex.europa.eu",
  "legifrance.gouv.fr",
  "support.google.com",
]);

const TARGET_TOPIC_MAP: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    payments_rate_table: ["payments_pricing", "provider_coverage"],
    cpic: ["country_economics", "payments_pricing", "provider_coverage"],
    priors: ["payments_pricing", "country_economics", "negotiation"],
    country_economics: ["country_economics", "regulation"],
    negotiation: ["negotiation", "payments_pricing", "provider_coverage"],
    regulatory: ["legal", "regulation", "risk_operations"],
    provider_intelligence: ["provider_coverage", "payments_pricing"],
    analyzer: ["payments_pricing", "country_economics"],
    moat: ["payments_pricing", "provider_coverage", "country_economics"],
    knowledge_integrity: ["evaluation_corpus", "document_intelligence"],
  });

const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  at: ["austria", "autriche"], be: ["belgium", "belgique", "belgica"],
  bg: ["bulgaria", "bulgarie"], ch: ["switzerland", "suisse", "suiza"],
  cy: ["cyprus", "chypre", "chipre"], cz: ["czechia", "czech republic", "republica checa", "tchequie"],
  de: ["germany", "allemagne", "alemania", "deutschland"], dk: ["denmark", "danemark", "dinamarca"],
  ee: ["estonia", "estonie"], es: ["spain", "espagne", "espana"],
  fi: ["finland", "finlande", "finlandia"], fr: ["france", "francia"],
  gb: ["united kingdom", "uk", "royaume uni", "reino unido"], gr: ["greece", "grece", "grecia"],
  hr: ["croatia", "croatie", "croacia"], hu: ["hungary", "hongrie", "hungria"],
  ie: ["ireland", "irlande", "irlanda"], is: ["iceland", "islande", "islandia"],
  it: ["italy", "italie", "italia"], li: ["liechtenstein"],
  lt: ["lithuania", "lituanie", "lituania"], lu: ["luxembourg", "luxemburgo"],
  lv: ["latvia", "lettonie", "letonia"], mc: ["monaco"],
  mt: ["malta", "malte"], nl: ["netherlands", "pays bas", "paises bajos", "nederland"],
  no: ["norway", "norvege", "noruega"], pl: ["poland", "pologne", "polonia"],
  pt: ["portugal"], ro: ["romania", "roumanie", "rumania"],
  se: ["sweden", "suede", "suecia"], si: ["slovenia", "slovenie", "eslovenia"],
  sk: ["slovakia", "slovaquie", "eslovaquia"],
});

type AnyRecord = Record<string, any>;

export function validateCuratedResearchSourceBindings(
  sourceDocuments: readonly AnyRecord[],
  records: readonly AnyRecord[],
  knownDocumentShas: readonly string[],
) {
  const errors: string[] = [];
  const knownShas = new Set(knownDocumentShas);
  const sourceById = new Map<string, AnyRecord>();
  for (const source of sourceDocuments) {
    const id = asText(source?.doc_id, 180);
    if (!id || sourceById.has(id)) errors.push("CURATED_SOURCE_DOCUMENT_ID_DUPLICATE_OR_MISSING");
    else sourceById.set(id, source);
  }
  for (const record of records) {
    const recordId = asText(record?.id, 180) || "unknown";
    const ids = Array.isArray(record?.source_document_ids) ? record.source_document_ids : [];
    const shas = Array.isArray(record?.source_sha256) ? record.source_sha256 : [];
    if (!ids.length || ids.length !== shas.length) {
      errors.push(`CURATED_RECORD_SOURCE_CARDINALITY_INVALID:${recordId}`);
      continue;
    }
    for (let index = 0; index < ids.length; index += 1) {
      const id = asText(ids[index], 180);
      const sha = asText(shas[index], 80);
      const source = sourceById.get(id);
      if (!source || !knownShas.has(sha) || asText(source?.sha256, 80) !== sha) {
        errors.push(`CURATED_RECORD_SOURCE_BINDING_INVALID:${recordId}:${id || "missing"}`);
      }
    }
  }
  return [...new Set(errors)].sort();
}

export type ResearchKnowledgeCitation = {
  citation_id: string;
  source_id: string;
  document_sha256: string;
  title: string;
  heading: string;
  locator: string;
  capture_date: string | null;
  source_urls: string[];
  evidence_authority: "official_link_present" | "external_research_only";
  truth_level: string;
  stale?: boolean;
  stale_reason?: string | null;
  temporal_status?: string;
};

export type ResearchKnowledgeResult = {
  chunk_id: string;
  source_id: string;
  title: string;
  heading: string;
  heading_path: string[];
  locator: string;
  text: string;
  topics: string[];
  countries: string[];
  providers: string[];
  capture_date: string | null;
  effective_date: string | null;
  truth_level: string;
  confidence: string;
  evidence_authority: "official_link_present" | "external_research_only";
  source_urls: string[];
  opaque_citations: string[];
  citation: ResearchKnowledgeCitation;
  citations: ResearchKnowledgeCitation[];
  source_document_ids: string[];
  source_sha256s: string[];
  score: number;
  stale: boolean;
  stale_reason: string | null;
  temporal_status: string;
  untrusted: true;
  prompt_instruction_authority: false;
  auto_promote_facts: false;
  training_eligible: false;
  model_eligible: false;
  calibration_eligible: false;
  record_id: string | null;
  record_kind: "curated_candidate" | "source_chunk";
  target_systems: string[];
  normalized_record: AnyRecord | null;
};

export type ResearchKnowledgeRetrievalInput = {
  query?: unknown;
  country?: unknown;
  countries?: unknown;
  provider?: unknown;
  providers?: unknown;
  topic?: unknown;
  topics?: unknown;
  truth_level?: unknown;
  truth_levels?: unknown;
  captured_from?: unknown;
  captured_to?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
  as_of?: unknown;
  stale_after_days?: unknown;
  include_stale?: unknown;
  target_system?: unknown;
  curated_only?: unknown;
  limit?: unknown;
};

const asText = (value: unknown, max = MAX_FILTER_VALUE_CHARACTERS) =>
  String(value ?? "").trim().slice(0, max);

const normalize = (value: unknown) =>
  asText(value, MAX_QUERY_CHARACTERS)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const identifier = (value: unknown) =>
  asText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const exactValues = (...values: unknown[]) => {
  const flattened = values.flatMap((value) =>
    Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  );
  return [
    ...new Set(
      flattened
        .slice(0, MAX_FILTER_VALUES)
        .map((value) => normalize(asText(value)))
        .filter(Boolean),
    ),
  ];
};

const topicValues = (...values: unknown[]) => [
  ...new Set(
    values
      .flatMap((value) =>
        Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
      )
      .slice(0, MAX_FILTER_VALUES)
      .map(identifier)
      .filter(Boolean),
  ),
];

const tokenize = (value: unknown) =>
  [
    ...new Set(
      normalize(value)
        .split(/\s+/)
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
        .slice(0, 64),
    ),
  ];

const validIsoDay = (value: unknown) => {
  const text = asText(value, 40);
  const time = Date.parse(text);
  return text && Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

const sourceUrls = (row: AnyRecord) =>
  [
    ...new Set(
      (Array.isArray(row?.source_urls) ? row.source_urls : [])
        .map((value: unknown) => asText(value, 2_000))
        .filter((value: string) => /^https:\/\//i.test(value)),
    ),
  ].slice(0, 24);

const officialLinkPresent = (urls: string[]) =>
  urls.some((value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return [...OFFICIAL_HOSTS].some(
        (official) => hostname === official || hostname.endsWith(`.${official}`),
      );
    } catch {
      return false;
    }
  });

const authorityFor = (row: AnyRecord) =>
  officialLinkPresent(sourceUrls(row))
    ? ("official_link_present" as const)
    : ("external_research_only" as const);

const truthLevelFor = (row: AnyRecord) =>
  asText(row?.truth_level || "UNVERIFIED_EXTERNAL_RESEARCH", 80) ||
  "UNVERIFIED_EXTERNAL_RESEARCH";

const dateFor = (row: AnyRecord, key: string) =>
  validIsoDay(row?.[key]) || null;

const inferredEntities = (row: AnyRecord, field: "countries" | "providers") => {
  const direct = exactValues(row?.[field], row?.[field.slice(0, -1)]);
  if (direct.length) return direct;
  return [];
};

const containsPhrase = (normalizedHaystack: string, value: string) =>
  ` ${normalizedHaystack} `.includes(` ${normalize(value)} `);

const countryMatchesText = (normalizedHaystack: string, country: string) => {
  const canonical = identifier(country);
  const aliases = COUNTRY_ALIASES[canonical] || [country];
  return aliases.some((alias) => containsPhrase(normalizedHaystack, alias)) ||
    (canonical.length !== 2 && containsPhrase(normalizedHaystack, canonical));
};

const providerMatchesText = (normalizedHaystack: string, provider: string) =>
  containsPhrase(normalizedHaystack, provider);

const boundedStructured = (value: unknown, depth = 0): any => {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return asText(value, 1_000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (depth >= 4) return "[bounded]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => boundedStructured(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as AnyRecord)
        .slice(0, 30)
        .map(([key, item]) => [asText(key, 120), boundedStructured(item, depth + 1)]),
    );
  }
  return null;
};

function curatedRecordRows() {
  const documents = RESEARCH_KNOWLEDGE_CATALOG.source_documents as readonly AnyRecord[];
  const documentById = new Map(documents.map((document) => [asText(document.doc_id), document]));
  const generatedBySha = new Map(
    (RESEARCH_KNOWLEDGE_DOCUMENTS as readonly AnyRecord[])
      .map((document) => [asText(document.document_sha256 || document.document_sha, 80), document]),
  );
  return (RESEARCH_KNOWLEDGE_CATALOG.records as readonly AnyRecord[]).map((record) => {
    const sourceDocumentIds = (Array.isArray(record?.source_document_ids) ? record.source_document_ids : [])
      .map((value: unknown) => asText(value, 180)).filter(Boolean);
    const sourceSha256s = (Array.isArray(record?.source_sha256) ? record.source_sha256 : [])
      .map((value: unknown) => asText(value, 80)).filter(Boolean);
    const firstDocument = documentById.get(sourceDocumentIds[0]) || {};
    const sha = sourceSha256s[0] || asText(firstDocument.sha256, 80);
    const lineStart = clampedInteger(record?.section_locator?.line_start, 1, 1, 10_000_000);
    const lineEnd = clampedInteger(record?.section_locator?.line_end, lineStart, lineStart, 10_000_000);
    const storedLocator = asText(firstDocument.stored_locator, 900);
    const sourceBindings = sourceDocumentIds.map((documentId, index) => {
      const catalogDocument = documentById.get(documentId) || {};
      const boundSha = sourceSha256s[index] || asText(catalogDocument.sha256, 80);
      const generatedDocument = generatedBySha.get(boundSha) || {};
      return {
        source_id: boundSha ? `research:${boundSha}` : `research-document:${documentId}`,
        document_sha256: boundSha,
        title: asText(generatedDocument.title || catalogDocument.filename || documentId, 500),
        heading: asText(record?.section_locator?.heading || record?.topic, 500),
        locator: index === 0 && storedLocator
          ? `${storedLocator}:L${lineStart}-L${lineEnd}`
          : asText(catalogDocument.stored_locator, 1_000),
        capture_date: validIsoDay(generatedDocument.capture_date || record?.observed_date),
        source_urls: sourceUrls(generatedDocument),
        truth_level: asText(record?.truth_level, 120) || "CURATED_CANDIDATE_PENDING_REVIEW",
      };
    });
    const normalizedRecord = {
      domain: asText(record?.domain, 120),
      topic: asText(record?.topic, 160),
      countries: exactValues(record?.countries),
      country_set_ids: exactValues(record?.country_set_ids),
      providers: (Array.isArray(record?.providers) ? record.providers : [])
        .map((value: unknown) => asText(value, 160)).filter(Boolean).slice(0, 40),
      value: boundedStructured(record?.value),
      native_currency: asText(record?.native_currency, 20) || null,
      unit: asText(record?.unit, 120) || null,
      evidence_tier: asText(record?.evidence_tier, 120) || null,
      evidence_quality: asText(record?.evidence_quality, 240) || null,
      provenance_status: asText(record?.provenance_status, 160) || null,
      review_by: validIsoDay(record?.freshness?.review_by),
      freshness_status: asText(record?.freshness?.status, 120) || null,
    };
    return {
      chunk_id: `research-record:${asText(record?.id, 180)}`,
      record_id: asText(record?.id, 180),
      record_kind: "curated_candidate",
      source_id: sha ? `research:${sha}` : `research-record:${asText(record?.id, 180)}`,
      source_document_ids: sourceDocumentIds,
      source_sha256s: sourceSha256s,
      source_bindings: sourceBindings,
      document_sha: sha,
      document_sha256: sha,
      title: `Curated research candidate · ${asText(record?.domain || "research", 120)}`,
      heading: asText(record?.section_locator?.heading || record?.topic, 500),
      heading_path: [
        asText(record?.domain, 120),
        asText(record?.section_locator?.heading || record?.topic, 500),
      ].filter(Boolean),
      locator: storedLocator
        ? `${storedLocator}:L${lineStart}-L${lineEnd}`
        : `research-record:${asText(record?.id, 180)}`,
      text: [
        asText(record?.topic, 500),
        asText(record?.evidence_excerpt, 1_800),
        typeof record?.value === "string"
          ? asText(record.value, 1_800)
          : JSON.stringify(boundedStructured(record?.value)),
      ].filter(Boolean).join("\n"),
      source_urls: sourceUrls(record),
      opaque_citations: [],
      capture_date: validIsoDay(record?.observed_date) || validIsoDay(RESEARCH_KNOWLEDGE_CATALOG.capture_date),
      effective_date: validIsoDay(record?.effective_from),
      review_by: validIsoDay(record?.freshness?.review_by),
      expires_at: validIsoDay(record?.expires_at),
      topics: [record?.domain, record?.topic].filter(Boolean),
      countries: record?.countries || [],
      providers: record?.providers || [],
      target_systems: record?.target_systems || [],
      truth_level: asText(record?.truth_level, 120) || "CURATED_CANDIDATE_PENDING_REVIEW",
      confidence: record?.confidence ?? "UNASSESSED",
      untrusted: true,
      auto_promote_facts: false,
      training_eligible: false,
      model_eligible: false,
      calibration_eligible: false,
      normalized_record: normalizedRecord,
    };
  });
}

const dateInRange = (
  value: string | null,
  from: string | null,
  to: string | null,
) => {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

const clampedInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
};

const CURATED_RECORD_ROWS = Object.freeze(curatedRecordRows());

const boundedConflicts = () =>
  (RESEARCH_KNOWLEDGE_CONFLICTS.conflicts as readonly AnyRecord[]).map((row) => Object.freeze({
    conflict_id: asText(row?.conflict_id, 200),
    conflict_type: asText(row?.conflict_type, 160),
    record_ids: (Array.isArray(row?.record_ids) ? row.record_ids : []).map((value: unknown) => asText(value, 180)).filter(Boolean),
    source_document_ids: (Array.isArray(row?.source_document_ids) ? row.source_document_ids : []).map((value: unknown) => asText(value, 80)).filter(Boolean),
    status: asText(row?.status, 160),
    severity: asText(row?.severity, 40),
    reason: asText(row?.reason, 1_000),
    operational_effect: asText(row?.operational_effect, 200),
    execution_blocked: true,
    training_blocked: true,
  }));

const CURATED_CONFLICTS = Object.freeze(boundedConflicts());

function relevantConflicts(results: ResearchKnowledgeResult[]) {
  const recordIds = new Set(results.map((row) => row.record_id).filter(Boolean));
  const sourceIds = new Set(results.map((row) => row.source_id.replace(/^research:/, "")));
  return CURATED_CONFLICTS.filter((row) =>
    row.record_ids.some((id) => recordIds.has(id)) ||
    (row.source_document_ids.length > 0 && [...sourceIds].some((sha) =>
      (RESEARCH_KNOWLEDGE_CATALOG.source_documents as readonly AnyRecord[])
        .some((document) => row.source_document_ids.includes(asText(document.doc_id)) && asText(document.sha256) === sha)
    ))
  ).slice(0, 20);
}

function staleAssessment(row: AnyRecord, asOf: string, staleAfterDays: number) {
  const expiresAt = dateFor(row, "expires_at");
  if (expiresAt && asOf > expiresAt) return { stale: true, stale_reason: "SOURCE_EXPIRED", temporal_status: "EXPIRED" };
  const reviewBy = dateFor(row, "review_by") || validIsoDay(row?.normalized_record?.review_by);
  if (reviewBy && asOf > reviewBy) return { stale: true, stale_reason: "SOURCE_REVIEW_DUE", temporal_status: "REVIEW_DUE" };
  const effectiveDate = dateFor(row, "effective_date");
  if (effectiveDate && asOf < effectiveDate) return { stale: false, stale_reason: null, temporal_status: "FUTURE_NOT_YET_EFFECTIVE" };
  const captured = dateFor(row, "capture_date");
  if (!captured) return { stale: true, stale_reason: "SOURCE_DATE_MISSING", temporal_status: "UNKNOWN" };
  const age = Date.parse(asOf) - Date.parse(`${captured}T00:00:00.000Z`);
  if (!Number.isFinite(age)) return { stale: true, stale_reason: "SOURCE_DATE_INVALID", temporal_status: "UNKNOWN" };
  if (age < 0) return { stale: true, stale_reason: "SOURCE_CAPTURE_AFTER_AS_OF", temporal_status: "UNKNOWN" };
  return age > staleAfterDays * 86_400_000
    ? { stale: true, stale_reason: "SOURCE_OLDER_THAN_STALENESS_POLICY", temporal_status: "STALE" }
    : { stale: false, stale_reason: null, temporal_status: "CURRENT" };
}

const coverageScore = (haystack: string, queryTokens: string[]) => {
  if (!queryTokens.length) return 0;
  let score = 0;
  for (const token of queryTokens) {
    const exact = new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`, "g");
    const occurrences = haystack.match(exact)?.length || 0;
    if (occurrences) score += 4 + Math.min(occurrences, 4);
  }
  return score;
};

function scoreRow(
  row: AnyRecord,
  queryTokens: string[],
  filters: {
    countries: string[];
    providers: string[];
    topics: string[];
  },
  stale: boolean,
) {
  const title = normalize(row?.title);
  const heading = normalize([row?.heading, ...(row?.heading_path || [])].join(" "));
  const body = normalize(row?.text);
  const topics = topicValues(row?.topics);
  const countries = inferredEntities(row, "countries");
  const providers = inferredEntities(row, "providers");
  let score = coverageScore(title, queryTokens) * 4;
  score += coverageScore(heading, queryTokens) * 3;
  score += coverageScore(body, queryTokens);
  score += filters.topics.filter((topic) => topics.includes(topic)).length * 20;
  score += filters.countries.filter((country) => countries.includes(country)).length * 20;
  score += filters.providers.filter((provider) => providers.includes(provider)).length * 20;
  score += authorityFor(row) === "official_link_present" ? 6 : 0;
  score += stale ? -8 : 3;
  return score;
}

function citationFor(
  row: AnyRecord,
  stale?: { stale: boolean; stale_reason: string | null; temporal_status?: string },
): ResearchKnowledgeCitation {
  const sourceId = asText(row?.source_id, 180);
  const chunkId = asText(row?.chunk_id, 180);
  const locator = asText(row?.locator, 1_000);
  return Object.freeze({
    citation_id: `${sourceId}:${chunkId}`,
    source_id: sourceId,
    document_sha256: asText(row?.document_sha256 || row?.document_sha, 80),
    title: asText(row?.title, 500),
    heading: asText(row?.heading, 500),
    locator,
    capture_date: dateFor(row, "capture_date"),
    source_urls: sourceUrls(row),
    evidence_authority: authorityFor(row),
    truth_level: truthLevelFor(row),
    stale: stale?.stale,
    stale_reason: stale?.stale_reason ?? null,
    temporal_status: stale?.temporal_status || "UNKNOWN",
  });
}

export function validateResearchKnowledgeCorpus() {
  const documents = RESEARCH_KNOWLEDGE_DOCUMENTS as readonly AnyRecord[];
  const chunks = RESEARCH_KNOWLEDGE_CHUNKS as readonly AnyRecord[];
  const errors: string[] = [];
  const sourceIds = new Set<string>();
  const documentShas = new Set<string>();
  for (const document of documents) {
    const sourceId = asText(document?.source_id, 180);
    const sha = asText(document?.document_sha256 || document?.document_sha, 80);
    if (!sourceId || sourceIds.has(sourceId)) errors.push("DOCUMENT_SOURCE_ID_DUPLICATE_OR_MISSING");
    if (!/^[a-f0-9]{64}$/.test(sha) || documentShas.has(sha)) errors.push("DOCUMENT_SHA_DUPLICATE_OR_INVALID");
    if (document?.untrusted !== true || document?.auto_promote_facts !== false || document?.training_eligible !== false) {
      errors.push("DOCUMENT_TRUST_BOUNDARY_INVALID");
    }
    sourceIds.add(sourceId);
    documentShas.add(sha);
  }
  const chunkIds = new Set<string>();
  for (const chunk of chunks) {
    const chunkId = asText(chunk?.chunk_id, 180);
    const sha = asText(chunk?.document_sha256 || chunk?.document_sha, 80);
    if (!chunkId || chunkIds.has(chunkId)) errors.push("CHUNK_ID_DUPLICATE_OR_MISSING");
    if (!sourceIds.has(asText(chunk?.source_id, 180)) || !documentShas.has(sha)) errors.push("CHUNK_SOURCE_LINEAGE_INVALID");
    if (!asText(chunk?.locator, 1_000) || !asText(chunk?.text, MAX_RESULT_TEXT_CHARACTERS)) errors.push("CHUNK_CONTENT_OR_LOCATOR_MISSING");
    if (chunk?.untrusted !== true || chunk?.auto_promote_facts !== false || chunk?.training_eligible !== false) {
      errors.push("CHUNK_TRUST_BOUNDARY_INVALID");
    }
    chunkIds.add(chunkId);
  }
  const safety = RESEARCH_KNOWLEDGE_CATALOG.safety_contract as AnyRecord;
  for (const flag of [
    "default_execution_eligible",
    "default_training_eligible",
    "default_model_input_eligible",
    "default_calibration_eligible",
    "default_auto_promote_eligible",
    "official_url_means_verified",
    "compiled_report_can_satisfy_runtime_or_legal_gate",
  ]) {
    if (safety?.[flag] !== false) errors.push("CURATED_CATALOG_SAFETY_CONTRACT_INVALID");
  }
  const catalogRecords = RESEARCH_KNOWLEDGE_CATALOG.records as readonly AnyRecord[];
  const catalogSources = RESEARCH_KNOWLEDGE_CATALOG.source_documents as readonly AnyRecord[];
  errors.push(...validateCuratedResearchSourceBindings(catalogSources, catalogRecords, [...documentShas]));
  const recordIds = new Set<string>();
  for (const record of catalogRecords) {
    const id = asText(record?.id, 180);
    if (!id || recordIds.has(id)) errors.push("CURATED_RECORD_ID_DUPLICATE_OR_MISSING");
    if (
      record?.execution_eligible !== false ||
      record?.training_eligible !== false ||
      record?.model_input_eligible !== false ||
      record?.calibration_eligible !== false ||
      record?.auto_promote_eligible !== false
    ) errors.push("CURATED_RECORD_AUTHORITY_INVALID");
    const shas = Array.isArray(record?.source_sha256) ? record.source_sha256 : [];
    if (!shas.length || shas.some((sha: unknown) => !documentShas.has(asText(sha, 80)))) {
      errors.push("CURATED_RECORD_SOURCE_LINEAGE_INVALID");
    }
    recordIds.add(id);
  }
  return Object.freeze({
    ok: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    documents: documents.length,
    chunks: chunks.length,
    curated_records: catalogRecords.length,
  });
}

const CORPUS_VALIDATION = validateResearchKnowledgeCorpus();
if (!CORPUS_VALIDATION.ok) {
  throw new Error(`research_knowledge_corpus_invalid:${CORPUS_VALIDATION.errors.join(",")}`);
}

function resultFor(
  row: AnyRecord,
  score: number,
  stale: { stale: boolean; stale_reason: string | null; temporal_status: string },
): ResearchKnowledgeResult {
  const sourceBindings = Array.isArray(row?.source_bindings) ? row.source_bindings : [];
  const citations = sourceBindings.length
    ? sourceBindings.map((binding: AnyRecord) => citationFor({ ...row, ...binding }, stale))
    : [citationFor(row, stale)];
  const citation = citations[0];
  const primarySha = citation.document_sha256;
  const catalogSources = RESEARCH_KNOWLEDGE_CATALOG.source_documents as readonly AnyRecord[];
  const sourceDocumentIds = (Array.isArray(row?.source_document_ids) ? row.source_document_ids : catalogSources
    .filter((source) => asText(source?.sha256, 80) === primarySha)
    .map((source) => source.doc_id))
    .map((value: unknown) => asText(value, 180)).filter(Boolean);
  const sourceSha256s = (Array.isArray(row?.source_sha256s) ? row.source_sha256s : sourceDocumentIds.map(() => primarySha))
    .map((value: unknown) => asText(value, 80)).filter(Boolean);
  return Object.freeze({
    chunk_id: asText(row?.chunk_id, 180),
    source_id: citation.source_id,
    title: citation.title,
    heading: citation.heading,
    heading_path: (Array.isArray(row?.heading_path) ? row.heading_path : [])
      .map((value: unknown) => asText(value, 500))
      .filter(Boolean)
      .slice(0, 12),
    locator: citation.locator,
    text: asText(row?.text, MAX_RESULT_TEXT_CHARACTERS),
    topics: topicValues(row?.topics),
    countries: inferredEntities(row, "countries"),
    providers: inferredEntities(row, "providers"),
    capture_date: citation.capture_date,
    effective_date: dateFor(row, "effective_date"),
    truth_level: citation.truth_level,
    confidence: asText(row?.confidence || "UNASSESSED", 80) || "UNASSESSED",
    evidence_authority: citation.evidence_authority,
    source_urls: citation.source_urls,
    opaque_citations: exactValues(row?.opaque_citations),
    citation,
    citations,
    source_document_ids: sourceDocumentIds,
    source_sha256s: sourceSha256s,
    score,
    stale: stale.stale,
    stale_reason: stale.stale_reason,
    temporal_status: stale.temporal_status,
    untrusted: true,
    prompt_instruction_authority: false,
    auto_promote_facts: false,
    training_eligible: false,
    model_eligible: false,
    calibration_eligible: false,
    record_id: asText(row?.record_id, 180) || null,
    record_kind: row?.record_kind === "curated_candidate" ? "curated_candidate" : "source_chunk",
    target_systems: (Array.isArray(row?.target_systems) ? row.target_systems : [])
      .map((value: unknown) => asText(value, 160))
      .filter(Boolean)
      .slice(0, 24),
    normalized_record: row?.record_kind === "curated_candidate"
      ? boundedStructured(row?.normalized_record)
      : null,
  });
}

/**
 * Pure deterministic lexical retrieval. External report text is returned as
 * untrusted quoted context. It never grants fact, prompt, execution, model,
 * training or calibration authority.
 */
export function retrieveResearchKnowledge(
  input: ResearchKnowledgeRetrievalInput = {},
) {
  const query = asText(input?.query, MAX_QUERY_CHARACTERS);
  const queryTokens = tokenize(query);
  const countries = exactValues(input?.country, input?.countries);
  const providers = exactValues(input?.provider, input?.providers);
  const requestedTopics = topicValues(input?.topic, input?.topics);
  const targetSystem = identifier(input?.target_system);
  const topics = [
    ...new Set([
      ...requestedTopics,
      ...(TARGET_TOPIC_MAP[targetSystem] || []),
    ]),
  ];
  const truthLevels = exactValues(input?.truth_level, input?.truth_levels);
  const capturedFrom = validIsoDay(input?.captured_from);
  const capturedTo = validIsoDay(input?.captured_to);
  const effectiveFrom = validIsoDay(input?.effective_from);
  const effectiveTo = validIsoDay(input?.effective_to);
  const asOf = validIsoDay(input?.as_of) || new Date().toISOString().slice(0, 10);
  const staleAfterDays = clampedInteger(
    input?.stale_after_days,
    DEFAULT_STALE_AFTER_DAYS,
    1,
    3_650,
  );
  const includeStale = input?.include_stale !== false;
  const curatedOnly = input?.curated_only === true;
  const limit = clampedInteger(input?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const hasSelector =
    queryTokens.length > 0 ||
    countries.length > 0 ||
    providers.length > 0 ||
    topics.length > 0 ||
    truthLevels.length > 0 ||
    !!capturedFrom ||
    !!capturedTo ||
    !!effectiveFrom ||
    !!effectiveTo;

  if (!hasSelector) {
    return Object.freeze({
      status: "INVALID_QUERY",
      version: RESEARCH_KNOWLEDGE_RETRIEVAL_VERSION,
      error: "research_query_or_filter_required",
      results: [] as ResearchKnowledgeResult[],
      citations: [] as ResearchKnowledgeCitation[],
      conflicts: [] as AnyRecord[],
      authority: retrievalAuthority(),
    });
  }

  const candidates = ([...CURATED_RECORD_ROWS, ...(curatedOnly ? [] : RESEARCH_KNOWLEDGE_CHUNKS)] as readonly AnyRecord[])
    .flatMap((row) => {
      const rowTopics = topicValues(row?.topics);
      const rowCountries = inferredEntities(row, "countries");
      const rowProviders = inferredEntities(row, "providers");
      const rowTruthLevel = normalize(truthLevelFor(row));
      const haystack = normalize(
        [row?.title, row?.heading, ...(row?.heading_path || []), row?.text].join(" "),
      );
      const queryMatches = queryTokens.length === 0 || queryTokens.some((token) => haystack.includes(token));
      const topicMatches = topics.length === 0 || topics.some((topic) => rowTopics.includes(topic));
      const countryMatches = countries.length === 0 || countries.some((country) =>
        rowCountries.includes(country) || countryMatchesText(haystack, country)
      );
      const providerMatches = providers.length === 0 || providers.some((provider) =>
        rowProviders.includes(provider) || providerMatchesText(haystack, provider)
      );
      const truthMatches = truthLevels.length === 0 || truthLevels.includes(rowTruthLevel);
      const captureDate = dateFor(row, "capture_date");
      const effectiveDate = dateFor(row, "effective_date");
      const datesMatch = dateInRange(captureDate, capturedFrom, capturedTo) &&
        dateInRange(effectiveDate, effectiveFrom, effectiveTo);
      const stale = staleAssessment(row, asOf, staleAfterDays);
      if (
        !queryMatches ||
        !topicMatches ||
        !countryMatches ||
        !providerMatches ||
        !truthMatches ||
        !datesMatch ||
        (!includeStale && stale.stale)
      ) return [];
      return [{
        row,
        stale,
        score: scoreRow(row, queryTokens, { countries, providers, topics }, stale.stale),
      }];
    })
    .sort((left, right) =>
      right.score - left.score ||
      String(right.row.capture_date || "").localeCompare(String(left.row.capture_date || "")) ||
      String(left.row.chunk_id || "").localeCompare(String(right.row.chunk_id || ""))
    );

  const deduped: ResearchKnowledgeResult[] = [];
  const seenChunkIds = new Set<string>();
  const seenLocatorTexts = new Set<string>();
  for (const candidate of candidates) {
    const chunkId = asText(candidate.row?.chunk_id, 180);
    const duplicateKey = `${asText(candidate.row?.locator, 1_000)}:${normalize(candidate.row?.text)}`;
    if (!chunkId || seenChunkIds.has(chunkId) || seenLocatorTexts.has(duplicateKey)) continue;
    seenChunkIds.add(chunkId);
    seenLocatorTexts.add(duplicateKey);
    deduped.push(resultFor(candidate.row, candidate.score, candidate.stale));
    if (deduped.length >= limit) break;
  }

  return Object.freeze({
    status: deduped.length ? "OK" : "NO_MATCH",
    version: RESEARCH_KNOWLEDGE_RETRIEVAL_VERSION,
    query: {
      query,
      countries,
      providers,
      topics,
      truth_levels: truthLevels,
      captured_from: capturedFrom,
      captured_to: capturedTo,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      as_of: asOf,
      stale_after_days: staleAfterDays,
      include_stale: includeStale,
      target_system: targetSystem || null,
      curated_only: curatedOnly,
      limit,
    },
    results: deduped,
    citations: deduped.map((result) => result.citation),
    conflicts: relevantConflicts(deduped),
    conflict_status: relevantConflicts(deduped).length ? "CONFLICTS_VISIBLE_BLOCKING" : "NO_MATCHING_STRUCTURED_CONFLICT",
    authority: retrievalAuthority(),
  });
}

function retrievalAuthority() {
  return Object.freeze({
    external_research_is_untrusted: true,
    quoted_context_only: true,
    prompt_instruction_authority: false,
    fact_promotion_authority: false,
    decision_authority: false,
    execution_authority: false,
    training_eligible: false,
    model_eligible: false,
    calibration_eligible: false,
    official_link_is_not_official_verification: true,
    independent_source_verification_required: true,
  });
}

export function researchSourceSummary() {
  const documents = RESEARCH_KNOWLEDGE_DOCUMENTS as readonly AnyRecord[];
  const chunks = RESEARCH_KNOWLEDGE_CHUNKS as readonly AnyRecord[];
  const uniqueUrls = new Set<string>();
  const topics = new Set<string>();
  let officialLinkedChunks = 0;
  let staleDateMissing = 0;
  for (const row of documents) {
    sourceUrls(row).forEach((url) => uniqueUrls.add(url));
    topicValues(row?.topics).forEach((topic) => topics.add(topic));
    if (!dateFor(row, "capture_date")) staleDateMissing += 1;
  }
  for (const row of chunks) {
    if (authorityFor(row) === "official_link_present") officialLinkedChunks += 1;
  }
  return Object.freeze({
    status: "OK",
    version: RESEARCH_KNOWLEDGE_RETRIEVAL_VERSION,
    documents: documents.length,
    physical_original_aliases: documents.reduce(
      (count, row) => count + (Array.isArray(row.aliases) ? row.aliases.length : 0),
      0,
    ),
    chunks: chunks.length,
    unique_source_urls: uniqueUrls.size,
    official_linked_chunks: officialLinkedChunks,
    topics: [...topics].sort(),
    truth_levels: [...new Set(documents.map((row) => truthLevelFor(row)))].sort(),
    documents_missing_capture_date: staleDateMissing,
    structured_conflicts: CURATED_CONFLICTS.length,
    open_or_review_conflicts: CURATED_CONFLICTS.filter((row) => !String(row.status).startsWith("RESOLVED_")).length,
    conflict_status: CURATED_CONFLICTS.length ? "STRUCTURED_CONFLICTS_VISIBLE_BLOCKING" : "NO_STRUCTURED_CONFLICTS",
    retrieval: "deterministic_lexical_no_embeddings",
    authority: retrievalAuthority(),
  });
}

export function researchContextForTarget(
  input: ResearchKnowledgeRetrievalInput & { target_system: unknown },
) {
  const retrieval = retrieveResearchKnowledge(input);
  const results = retrieval.results || [];
  let used = 0;
  const context = results.flatMap((result) => {
    // Encode the excerpt as JSON and neutralize markup delimiters. This keeps
    // future imported text from closing the data boundary or manufacturing a
    // new prompt section while remaining readable to the model as quoted data.
    const encodedData = encodeUntrustedResearchData({
      citation: result.citation.citation_id,
      citations: result.citations,
      source_document_ids: result.source_document_ids,
      source_sha256s: result.source_sha256s,
      source: result.title,
      heading: result.heading,
      locator: result.locator,
      captured: result.capture_date || "unknown",
      truth_level: result.truth_level,
      evidence_authority: result.evidence_authority,
      stale: result.stale,
      stale_reason: result.stale_reason,
      temporal_status: result.temporal_status,
      excerpt: result.text,
    });
    const block = [
      "<untrusted_external_research>",
      "Encoding: JSON_ESCAPED_UNTRUSTED_DATA",
      encodedData,
      "</untrusted_external_research>",
    ].join("\n");
    if (used + block.length > MAX_CONTEXT_CHARACTERS) return [];
    used += block.length;
    return [block];
  }).join("\n\n");
  return Object.freeze({
    ...retrieval,
    context,
    context_characters: context.length,
    context_is_untrusted_data_not_instructions: true,
    context_encoding: "JSON_ESCAPED_UNTRUSTED_DATA",
    consumer_must_ignore_embedded_instructions: true,
    authority: retrievalAuthority(),
  });
}

export function encodeUntrustedResearchData(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}