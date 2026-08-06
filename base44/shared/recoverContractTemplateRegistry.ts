// recoverContractTemplateRegistry — v61 Checkpoint C (2026-08-06).
//
// IMMUTABLE version → template mapping. A contractual PDF must render with the
// template version IN FORCE AT ACCEPTANCE (frozen in acceptance_snapshot_json
// as template_version), never silently with whatever the current template
// happens to say. Bumping RECOVER_CONTRACT_TEMPLATE_VERSION therefore requires
// KEEPING the previous version's strings registered here — removing an entry
// that historical snapshots still reference would block their (re)generation,
// which is the correct failure mode: blocked beats misrepresented.
//
// UNKNOWN VERSION = HARD BLOCK: contractStringsForVersion throws
// `template_version_unknown` (a PERMANENT pdf error) instead of falling back to
// the current template. A document rendered with words the merchant never saw
// is not evidence of anything.
//
// Pure module (no SDK, no I/O) — runs in Deno (backend) and vitest (node).

import {
  contractStrings,
  RECOVER_CONTRACT_TEMPLATE_VERSION,
  type ContractLocale,
  type ContractStrings,
} from './recoverContractTemplates.ts';

const TEMPLATE_REGISTRY: Record<string, (locale: ContractLocale) => ContractStrings> = Object.freeze({
  // Current template. When the wording changes: bump the constant in
  // recoverContractTemplates.ts, add the NEW entry here, and keep this one
  // (frozen copy of the old strings) so historical snapshots keep resolving.
  [RECOVER_CONTRACT_TEMPLATE_VERSION]: contractStrings,
});

export function knownTemplateVersions(): string[] {
  return Object.keys(TEMPLATE_REGISTRY);
}

/**
 * The template version a mandate's document must render with.
 * Precedence: acceptance snapshot (frozen at acceptance) → already-generated
 * document's recorded version → legacy fallback to the current version
 * (snapshots created before template stamping carry no version; the current
 * template is the only registered text for them).
 */
export function resolveContractTemplateVersion(snapshot: any, mandate: any): string {
  const fromSnapshot = String(snapshot?.template_version || '');
  if (fromSnapshot) return fromSnapshot;
  const fromMandate = String(mandate?.contract_pdf_template_version || '');
  if (fromMandate) return fromMandate;
  return RECOVER_CONTRACT_TEMPLATE_VERSION;
}

/** Strings for an exact registered version. Unknown version → hard block. */
export function contractStringsForVersion(version: string, locale: ContractLocale): ContractStrings {
  const get = TEMPLATE_REGISTRY[String(version || '')];
  if (!get) {
    throw new Error(`template_version_unknown: no registered template for '${String(version || '')}'`);
  }
  return get(locale);
}