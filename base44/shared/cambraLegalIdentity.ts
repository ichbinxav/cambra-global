// cambraLegalIdentity — RECOVER-3 (2026-08-03).
//
// CAMBRA's own legal identity as it must appear on a contractual document.
//
// WHY THIS FILE EXISTS AT ALL: the audit for this chunk found that these data
// (registered address, registration number, VAT id, legal representative) exist
// NOWHERE as structured data — only as prose inside the Terms pages, which is a
// marketing surface, not a source of record. Copying them by hand into a PDF
// generator would have invented a source of truth. So they are configuration,
// read from ONE environment variable, and a document is NEVER produced with
// them missing: generateRecoverContractPdf fails PERMANENTLY with
// `legal_identity_missing` and raises an admin alert instead of shipping a
// contract with a blank or guessed provider identity.
//
// Bank details are deliberately NOT part of this object: no contractual PDF in
// RECOVER-3 asks for them, and an IBAN on a document that gets emailed around is
// a fraud vector, not a feature.

export type CambraLegalIdentity = {
  legal_name: string;
  legal_form: string;
  registered_address: string;
  registration_number: string;
  vat_id: string;
  share_capital?: string;
  representative_name: string;
  representative_role: string;
  support_email: string;
};

const REQUIRED_KEYS: (keyof CambraLegalIdentity)[] = [
  'legal_name',
  'legal_form',
  'registered_address',
  'registration_number',
  'vat_id',
  'representative_name',
  'representative_role',
  'support_email',
];

/**
 * Returns the configured identity, or the list of what is missing. Never throws
 * and never fills a gap with a placeholder — a caller that gets `ok:false` must
 * refuse to generate, not degrade.
 */
export function readLegalIdentity():
  | { ok: true; identity: CambraLegalIdentity }
  | { ok: false; missing: string[] } {
  const raw = Deno.env.get('CAMBRA_LEGAL_IDENTITY_JSON') || '';
  if (!raw.trim()) return { ok: false, missing: ['CAMBRA_LEGAL_IDENTITY_JSON'] };

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, missing: ['CAMBRA_LEGAL_IDENTITY_JSON:invalid_json'] };
  }

  const missing = REQUIRED_KEYS.filter(k => !String(parsed?.[k] ?? '').trim());
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    identity: {
      legal_name: String(parsed.legal_name).trim(),
      legal_form: String(parsed.legal_form).trim(),
      registered_address: String(parsed.registered_address).trim(),
      registration_number: String(parsed.registration_number).trim(),
      vat_id: String(parsed.vat_id).trim(),
      share_capital: parsed.share_capital ? String(parsed.share_capital).trim() : undefined,
      representative_name: String(parsed.representative_name).trim(),
      representative_role: String(parsed.representative_role).trim(),
      support_email: String(parsed.support_email).trim(),
    },
  };
}