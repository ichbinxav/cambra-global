// recoverContractPdf — RECOVER-3 (2026-08-03).
//
// Renders the contractual PDF from the FROZEN acceptance snapshot, and nothing
// else. It receives plain values; it never reads the database, so it cannot
// accidentally pull a current fee, a current baseline or a current Brand profile
// into a document that represents terms accepted in the past.
//
// TEMPLATE SAFETY: the document is drawn with jsPDF's text API, not an HTML
// renderer. Merchant-supplied strings (company name, signatory name, role) are
// therefore never parsed as markup, cannot execute script, cannot load an
// external resource and cannot trigger an SSRF — but they ARE still sanitized
// (control characters stripped, newlines flattened, hard length cap) so a crafted
// value cannot break the layout or smuggle invisible characters into evidence.
// No remote fonts, no remote images, no merchant-controlled asset is fetched.
//
// FORMAT CLAIMS, DELIBERATELY MODEST: a valid PDF 1.x with a %PDF header, page
// numbering and consistent margins. PDF/A conformance is NOT claimed, because
// nothing in this runtime can validate it.

import { jsPDF } from 'npm:jspdf@4.0.0';
import { checkboxTextFor, contractStrings, RECOVER_CONTRACT_TEMPLATE_VERSION, type ContractLocale } from './recoverContractTemplates.ts';
import type { CambraLegalIdentity } from './cambraLegalIdentity.ts';

const MARGIN = 18;
const WIDTH = 210;
const HEIGHT = 297;
const BODY_W = WIDTH - MARGIN * 2;
const INK = '#0C0C16';
const MUTED = '#585868';

/** Untrusted -> printable single line, bounded. */
function safe(value: unknown, max = 160): string {
  const s = String(value ?? '')
    // control chars + bidi/zero-width tricks out; they are invisible in a PDF
    // and would let a name misrepresent itself in an evidence annex.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

function fmtDate(value: unknown, locale: ContractLocale): string {
  const t = value ? new Date(String(value)) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  const intl = { en: 'en-IE', fr: 'fr-FR', es: 'es-ES' }[locale];
  try {
    return new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(t) + ' UTC';
  } catch {
    return t.toISOString();
  }
}

export type ContractPdfInput = {
  locale: ContractLocale;
  identity: CambraLegalIdentity;
  mandate: any;
  snapshot: any;
  reference: string;
  documentHashes: { label: string; value: string }[];
};

export type ContractPdfOutput = {
  bytes: Uint8Array;
  sha256: string;
  templateVersion: string;
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildRecoverContractPdf(input: ContractPdfInput): Promise<ContractPdfOutput> {
  const { locale, identity, mandate, snapshot, reference } = input;
  const t = contractStrings(locale);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const room = (needed: number) => {
    if (y + needed > HEIGHT - MARGIN - 12) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const heading = (text: string, size = 11) => {
    room(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(INK);
    doc.text(safe(text, 120), MARGIN, y);
    y += size * 0.5 + 3;
  };

  const body = (text: string, size = 9.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(MUTED);
    for (const line of doc.splitTextToSize(safe(text, 2000), BODY_W)) {
      room(6);
      doc.text(line, MARGIN, y);
      y += 4.6;
    }
    y += 2;
  };

  const bullet = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(MUTED);
    const lines = doc.splitTextToSize(safe(text, 600), BODY_W - 6);
    lines.forEach((line: string, i: number) => {
      room(6);
      if (i === 0) doc.text('-', MARGIN, y);
      doc.text(line, MARGIN + 5, y);
      y += 4.6;
    });
  };

  const field = (label: string, value: string) => {
    const v = safe(value, 200);
    if (!v) return;
    room(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.text(`${safe(label, 80)}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    const lines = doc.splitTextToSize(v, BODY_W - 58);
    lines.forEach((line: string, i: number) => {
      if (i > 0) { room(5); y += 4.2; }
      doc.text(line, MARGIN + 58, y);
    });
    y += 5.2;
  };

  const rule = () => {
    room(6);
    doc.setDrawColor(230, 230, 240);
    doc.line(MARGIN, y, WIDTH - MARGIN, y);
    y += 5;
  };

  // ── Cover ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#5B4CF5');
  doc.text('CAMBRA GLOBAL', MARGIN, y);
  y += 10;
  doc.setFontSize(20);
  doc.setTextColor(INK);
  for (const line of doc.splitTextToSize(t.doc_title, BODY_W)) { doc.text(line, MARGIN, y); y += 9; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text(t.doc_subtitle, MARGIN, y);
  y += 10;
  rule();
  field(t.label_mandate_reference, reference);
  field(t.label_accepted_on, fmtDate(mandate.signed_at, locale));
  field(t.label_document_version, mandate.document_version || '');
  field(t.label_template_version, RECOVER_CONTRACT_TEMPLATE_VERSION);
  field(t.label_language, locale.toUpperCase());
  y += 3;

  // ── Parties ────────────────────────────────────────────────────────────
  heading(t.provider_heading);
  field(t.client_legal_name, identity.legal_name);
  field(t.provider_legal_form, identity.legal_form);
  field(t.provider_address, identity.registered_address);
  field(t.provider_registration, identity.registration_number);
  field(t.provider_vat, identity.vat_id);
  if (identity.share_capital) field(t.provider_capital, identity.share_capital);
  field(t.provider_representative, `${identity.representative_name} (${identity.representative_role})`);
  field(t.provider_support, identity.support_email);
  y += 2;

  heading(t.client_heading);
  field(t.client_legal_name, mandate.legal_entity_name || '');
  field(t.client_organization, snapshot.organization_id || '');
  field(t.client_signatory, mandate.signed_by_name || '');
  field(t.client_signatory_email, mandate.signed_by_email || '');
  field(t.client_signatory_role, mandate.signed_by_role || '');
  y += 2;
  rule();

  // ── Sections ───────────────────────────────────────────────────────────
  heading(t.s1_title);
  t.s1_body.forEach(body);

  heading(t.s2_title);
  t.s2_body.forEach(body);
  field(t.s2_baseline_reference, snapshot.baseline_id || t.not_available);
  field(
    t.s2_baseline_value,
    snapshot.baseline_value != null ? `${snapshot.baseline_value} ${snapshot.baseline_currency || 'EUR'}` : t.not_available,
  );
  field(t.s2_baseline_type, snapshot.baseline_type || t.not_available);
  field(t.s2_verified_at, fmtDate(snapshot.baseline_verified_at, locale) || t.not_available);

  heading(t.s3_title);
  t.s3_body.forEach(body);
  // The accepted snapshot carries the EFFECTIVE fee. The standard rate and the
  // discount are derived from it arithmetically — never re-read from the current
  // referral programme, which may have moved since acceptance.
  const effective = Number(snapshot.fee_pct);
  const standard = 25;
  const discount = Number.isFinite(effective) ? Math.max(standard - effective, 0) : 0;
  field(t.s3_standard_fee, `${standard}%`);
  field(t.s3_discount, `${discount}%`);
  field(t.s3_effective_fee, Number.isFinite(effective) ? `${effective}%` : t.not_available);
  if (snapshot.projected_savings_annual != null) {
    field(t.s3_projected, `${snapshot.projected_savings_annual} ${snapshot.baseline_currency || 'EUR'}`);
  }

  heading(t.s4_title);
  t.s4_body.forEach(body);

  heading(t.s5_title);
  t.s5_body.forEach(body);

  heading(t.s6_title);
  t.s6_body.forEach(body);
  t.s6_actions.forEach(bullet);
  y += 2;

  heading(t.s7_title);
  t.s7_body.forEach(body);
  t.s7_limits.forEach(bullet);
  y += 2;

  heading(t.s8_title);
  t.s8_body.forEach(body);

  heading(t.s9_title);
  t.s9_body.forEach(body);
  field(t.s9_checkbox_label, checkboxTextFor(locale, mandate.legal_entity_name || ''));
  field(t.s9_declared_authority, t.s9_yes);
  field(t.s9_checkbox_accepted, t.s9_yes);
  field(t.client_signatory, mandate.signed_by_name || '');
  field(t.client_signatory_email, mandate.signed_by_email || '');
  field(t.client_signatory_role, mandate.signed_by_role || '');
  field(t.annex_signed_at, fmtDate(mandate.signed_at, locale));

  heading(t.s10_title);
  t.s10_body.forEach(body);
  input.documentHashes.forEach(d => field(d.label, d.value));

  heading(t.s11_title);
  t.s11_body.forEach(body);

  // ── Annex: evidence ────────────────────────────────────────────────────
  doc.addPage();
  y = MARGIN;
  heading(t.annex_title, 14);
  body(t.annex_intro);
  rule();
  field(t.annex_mandate_id, mandate.id || '');
  field(t.annex_activation_id, mandate.deal_activation_id || '');
  field(t.annex_organization, mandate.organization_id || '');
  field(t.label_document_version, mandate.document_version || '');
  field(t.annex_template_version, RECOVER_CONTRACT_TEMPLATE_VERSION);
  field(t.label_language, locale.toUpperCase());
  field(t.client_country, safe(mandate.country || snapshot.country || '') || t.not_available);
  field(t.annex_opened_at, fmtDate(mandate.acceptance_started_at, locale));
  field(t.annex_authenticated_at, fmtDate(mandate.authenticated_at, locale));
  field(t.annex_signed_at, fmtDate(mandate.signed_at, locale));
  field(t.client_signatory, mandate.signed_by_name || '');
  field(t.client_signatory_email, mandate.signed_by_email || '');
  field(t.client_signatory_role, mandate.signed_by_role || '');
  field(t.s9_declared_authority, t.s9_yes);
  field(t.s9_checkbox_accepted, t.s9_yes);
  field(t.s9_checkbox_label, checkboxTextFor(locale, mandate.legal_entity_name || ''));
  field(t.annex_snapshot_hash, mandate.acceptance_snapshot_hash || '');
  input.documentHashes.forEach(d => field(d.label, d.value));
  if (mandate.supersedes_id) field(t.annex_supersedes, mandate.supersedes_id);
  // An absent IP is stated neutrally: printing "IP: null" would look like a
  // failed capture of something we in fact never had.
  field(t.annex_ip, safe(mandate.ip_address || '') || t.annex_ip_unavailable);
  field(t.annex_user_agent, safe(mandate.user_agent || '', 120) || t.not_available);
  y += 2;
  body(t.annex_session_freshness, 8.5);

  // ── Footer on every page ───────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#9A9AAB');
    doc.text(`${t.footer_note} - ${reference} - ${RECOVER_CONTRACT_TEMPLATE_VERSION}`, MARGIN, HEIGHT - 10);
    doc.text(`${t.page_of} ${i}/${pages}`, WIDTH - MARGIN, HEIGHT - 10, { align: 'right' });
  }

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  if (bytes.length < 1000) throw new Error('pdf_build_failed: output too small');
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== '%PDF-') throw new Error('pdf_build_failed: missing PDF header');

  return { bytes, sha256: await sha256Hex(bytes), templateVersion: RECOVER_CONTRACT_TEMPLATE_VERSION };
}