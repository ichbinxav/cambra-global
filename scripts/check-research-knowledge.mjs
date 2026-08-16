import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/intelligence/research-knowledge.v1.json'), 'utf8'));
const conflicts = JSON.parse(fs.readFileSync(path.join(root, 'config/intelligence/research-conflicts.v1.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/intelligence/research-source-manifest.v1.json'), 'utf8'));

const fail = (code) => { throw new Error(code); };
const records = Array.isArray(catalog.records) ? catalog.records : fail('records_required');
const conflictRows = Array.isArray(conflicts.conflicts) ? conflicts.conflicts : fail('conflicts_required');
const recordIds = new Set();
const sourceShas = new Set(manifest.sources.map((row) => row.sha256));
const physicalCount = manifest.sources.length;
const uniqueCount = sourceShas.size;
const duplicateCount = physicalCount - uniqueCount;
if (manifest.totals.physical_originals !== physicalCount) fail('source_physical_total_drift');
if (manifest.totals.unique_documents !== uniqueCount) fail('source_unique_total_drift');
if (manifest.totals.exact_duplicates !== duplicateCount) fail('source_duplicate_total_drift');
const catalogSources = Array.isArray(catalog.source_documents) ? catalog.source_documents : fail('source_documents_required');
if (catalogSources.length !== physicalCount) fail('source_catalog_review_incomplete');
const catalogSourceById = new Map();
for (const source of catalogSources) {
  if (!source.doc_id || catalogSourceById.has(source.doc_id)) fail('source_catalog_doc_id_missing_or_duplicate');
  catalogSourceById.set(source.doc_id, source);
}
for (const source of manifest.sources) {
  const reviewed = catalogSources.filter((row) =>
    row.filename === source.original_filename && row.sha256 === source.sha256 && row.stored_locator === source.stored_path
  );
  if (reviewed.length !== 1) fail(`source_catalog_binding_invalid:${source.original_filename}`);
  const catalogRow = reviewed[0];
  const canonicalSource = source.duplicate_of
    ? manifest.sources.find((candidate) => candidate.alias_id === source.duplicate_of)
    : source;
  const canonicalCatalog = catalogSources.find((candidate) => candidate.filename === canonicalSource?.original_filename);
  if (!canonicalSource || !canonicalCatalog) fail(`source_canonical_alias_missing:${source.original_filename}`);
  if (source.duplicate_of === null && catalogRow.duplicate_of !== null) fail(`source_catalog_canonical_mismatch:${source.original_filename}`);
  if (source.duplicate_of !== null && catalogRow.duplicate_of !== canonicalCatalog.doc_id) fail(`source_catalog_duplicate_mismatch:${source.original_filename}`);
}
for (const record of records) {
  if (!record.id || recordIds.has(record.id)) fail('record_id_missing_or_duplicate');
  recordIds.add(record.id);
  const sourceDocumentIds = Array.isArray(record.source_document_ids) ? record.source_document_ids : [];
  const recordSourceShas = Array.isArray(record.source_sha256) ? record.source_sha256 : [];
  if (!sourceDocumentIds.length || sourceDocumentIds.length !== recordSourceShas.length) fail(`record_source_cardinality_invalid:${record.id}`);
  for (let index = 0; index < sourceDocumentIds.length; index += 1) {
    const source = catalogSourceById.get(sourceDocumentIds[index]);
    if (!source || !sourceShas.has(recordSourceShas[index]) || source.sha256 !== recordSourceShas[index]) {
      fail(`record_source_binding_invalid:${record.id}:${sourceDocumentIds[index] || 'missing'}`);
    }
  }
  for (const flag of ['execution_eligible', 'training_eligible', 'model_input_eligible', 'calibration_eligible', 'auto_promote_eligible']) {
    if (record[flag] !== false) fail(`authority_flag_not_false:${record.id}:${flag}`);
  }
  if (!record.truth_level || !record.provenance_status || !record.evidence_quality || !record.observed_date) fail(`record_truth_contract_incomplete:${record.id}`);
  if (!Array.isArray(record.target_systems) || !record.target_systems.includes('AgentRetrieval')) fail(`agent_retrieval_target_required:${record.id}`);
  if ((record.target_systems.includes('PaymentsRateTableCandidate') || record.target_systems.includes('CPICPriorCandidate')) && record.auto_promote_eligible !== false) fail(`candidate_auto_promotion_forbidden:${record.id}`);
}
for (const sha of sourceShas) {
  if (!records.some((record) => Array.isArray(record.source_sha256) && record.source_sha256.includes(sha))) {
    fail(`unique_source_not_normalized:${sha}`);
  }
}
const conflictIds = new Set();
for (const row of conflictRows) {
  if (!row.conflict_id || conflictIds.has(row.conflict_id)) fail('conflict_id_missing_or_duplicate');
  conflictIds.add(row.conflict_id);
  if (row.execution_blocked !== true || row.training_blocked !== true) fail(`conflict_must_block:${row.conflict_id}`);
  for (const id of row.record_ids || []) if (!recordIds.has(id)) fail(`conflict_record_unknown:${row.conflict_id}:${id}`);
}
if (!records.some((row) => row.target_systems.includes('PaymentsRateTableCandidate'))) fail('payments_rate_candidate_missing');
if (!records.some((row) => row.target_systems.includes('CPICPriorCandidate'))) fail('cpic_prior_candidate_missing');
if (!records.some((row) => row.target_systems.includes('CountryPaymentsEconomics'))) fail('country_economics_candidate_missing');
if (!records.some((row) => row.target_systems.includes('NegotiationPrior'))) fail('negotiation_prior_missing');
if (!records.some((row) => row.target_systems.includes('RegulatoryEvidenceQueue'))) fail('regulatory_candidate_missing');
console.log(`research-knowledge:catalog PASS — ${records.length} candidates · ${conflictRows.length} conflicts · 0 executable · 0 training`);
