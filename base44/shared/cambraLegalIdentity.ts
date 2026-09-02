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
  country: string;
  registration_number: string;
  siren: string;
  siret: string;
  vat_id: string;
  creation_date: string;
  activity_code: string;
  activity_label: string;
  fiscal_year_end: string;
  share_capital?: string;
  representative_name: string;
  representative_role: string;
  support_email: string;
};

export const CAMBRA_PUBLIC_LEGAL_IDENTITY = Object.freeze({
  legal_name: 'CAMBRA Global SASU',
  legal_form: 'Société par actions simplifiée (SAS)',
  // Official public company API: complement_adresse is null for SIREN 105452916.
  registered_address: '47 rue Vivienne, 75002 Paris, France',
  country: 'France',
  registration_number: 'SIREN 105 452 916',
  siren: '105452916',
  siret: '10545291600015',
  vat_id: 'FR50105452916',
  creation_date: '2026-05-26',
  activity_code: '7022Z',
  activity_label: 'Conseil pour les affaires et autres conseils de gestion',
  fiscal_year_end: '31/12',
});

export type CambraInternalFiscalProfile = {
  corporate_income_tax: { regime: string; rof: string };
  vat: { regime: string; rof: string; ca3_frequency: string };
  cfe: { rof: string };
  cvae: { regime: string; rof: string };
  rcm: { rof: string };
};

const REQUIRED_CONFIG_KEYS = [
  'representative_name',
  'representative_role',
  'support_email',
] as const;

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

  const missing = REQUIRED_CONFIG_KEYS.filter(k => !String(parsed?.[k] ?? '').trim());
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    identity: {
      ...CAMBRA_PUBLIC_LEGAL_IDENTITY,
      share_capital: parsed.share_capital ? String(parsed.share_capital).trim() : undefined,
      representative_name: String(parsed.representative_name).trim(),
      representative_role: String(parsed.representative_role).trim(),
      support_email: String(parsed.support_email).trim(),
    },
  };
}

/**
 * Internal French tax-office routing identifiers. This is intentionally
 * separate from the public identity so ROF values can be returned only by
 * authenticated Founder/Admin endpoints and never bundled into public pages.
 */
export function readInternalFiscalProfile():
  | { ok: true; profile: CambraInternalFiscalProfile }
  | { ok: false; missing: string[] } {
  const raw = Deno.env.get('CAMBRA_INTERNAL_FISCAL_PROFILE_JSON') || '';
  if (!raw.trim()) return { ok: false, missing: ['CAMBRA_INTERNAL_FISCAL_PROFILE_JSON'] };

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, missing: ['CAMBRA_INTERNAL_FISCAL_PROFILE_JSON:invalid_json'] };
  }

  const paths = [
    'corporate_income_tax.regime', 'corporate_income_tax.rof',
    'vat.regime', 'vat.rof', 'vat.ca3_frequency',
    'cfe.rof', 'cvae.regime', 'cvae.rof', 'rcm.rof',
  ];
  const valueAt = (path: string) => path.split('.').reduce((value: any, key) => value?.[key], parsed);
  const missing = paths.filter(path => !String(valueAt(path) ?? '').trim());
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    profile: {
      corporate_income_tax: { regime: String(parsed.corporate_income_tax.regime).trim(), rof: String(parsed.corporate_income_tax.rof).trim() },
      vat: { regime: String(parsed.vat.regime).trim(), rof: String(parsed.vat.rof).trim(), ca3_frequency: String(parsed.vat.ca3_frequency).trim() },
      cfe: { rof: String(parsed.cfe.rof).trim() },
      cvae: { regime: String(parsed.cvae.regime).trim(), rof: String(parsed.cvae.rof).trim() },
      rcm: { rof: String(parsed.rcm.rof).trim() },
    },
  };
}
