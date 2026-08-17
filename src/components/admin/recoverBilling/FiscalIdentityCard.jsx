// DASHBOARD-C9 (2026-08-17) — billing & tax identity, governed.
//
// This card used to call base44.entities.Brand.update directly from the browser, and
// the payload it sent included `tax_customer_type: "business_taxable_person"` on every
// save. recoverTax.ts:224 reads exactly that field and blocks invoicing without it, so
// filling in an address and pressing Save cleared the B2B gate with no evidence behind
// it. It also spread the whole form, so a blank input erased a stored VAT number while
// `vies_status` stayed "valid" — a reverse charge resting on a validation of a number
// no longer on file.
//
// Now: the save is a preview the operator confirms, the preview names every clearing
// and every revocation, and confirming B2B status is a separate action that refuses
// unless the evidence exists.
import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Receipt, BadgeCheck, ShieldAlert } from "lucide-react";

const FIELDS = [
  ["billing_legal_name", "Legal entity name"],
  ["billing_address_line1", "Address line 1"],
  ["billing_address_line2", "Address line 2 (optional)"],
  ["billing_postal_code", "Postal code"],
  ["billing_city", "City"],
  ["vat_number", "VAT number"],
];

const payload = (response) => response?.data || response || {};
async function callFinance(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `finance_${action}`, ...body }));
  return data || {};
}

export default function FiscalIdentityCard({ brandId }) {
  const [brand, setBrand] = useState(null);
  const [form, setForm] = useState({
    billing_legal_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "FR",
    vat_number: "",
  });
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // Read through the governed merchant view rather than the entity, so the page has
    // no base44.entities access at all.
    const data = await callFinance("billing_identity_view", { brand_id: brandId }).catch(() => ({}));
    const b = data?.brand || null;
    setBrand(b);
    if (b) {
      setForm({
        billing_legal_name: b.billing_legal_name || "",
        billing_address_line1: b.billing_address_line1 || "",
        billing_address_line2: b.billing_address_line2 || "",
        billing_postal_code: b.billing_postal_code || "",
        billing_city: b.billing_city || "",
        billing_country: (b.billing_country || "").toUpperCase() || "FR",
        vat_number: b.vat_number || "",
      });
    }
  }, [brandId]);

  useEffect(() => { if (brandId) load(); }, [brandId, load]);

  async function requestPreview() {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    const result = await callFinance("preview_billing_identity", { brand_id: brandId, patch: form });
    if (result?.ok) setPreview(result);
    else setMsg({ kind: "warn", text: result?.reason || result?.error || "Preview refused." });
    setBusy(false);
  }

  async function applyPreview() {
    setBusy(true);
    const result = await callFinance("apply_billing_identity", {
      brand_id: brandId, patch: form, expected_preview_hash: preview.preview_hash,
    });
    setPreview(null);
    setMsg(result?.ok
      ? {
        kind: "ok",
        text: result.b2b_confirmation_revoked
          ? "Saved. The B2B confirmation was revoked because the VAT number changed — confirm it again once VIES validates."
          : "Billing identity saved.",
      }
      : { kind: "warn", text: result?.reason || result?.error || "Save refused." });
    await load();
    setBusy(false);
  }

  async function confirmB2b() {
    setBusy(true);
    setMsg(null);
    const result = await callFinance("confirm_b2b_status", { brand_id: brandId });
    setMsg(result?.ok
      ? { kind: "ok", text: `B2B status confirmed (${result.tax_evidence_status}). ${result.claim_boundary || ""}` }
      : { kind: "warn", text: result?.reason || result?.error || "Could not confirm B2B status." });
    await load();
    setBusy(false);
  }

  async function validateVies() {
    setBusy(true);
    setMsg(null);
    const res = await base44.functions.invoke("checkVatVies", { brand_id: brandId });
    const d = payload(res);
    setMsg(
      d?.vies_status === "valid"
        ? { kind: "ok", text: `VIES: valid — ${d.name || "name not returned"}.` }
        : { kind: "warn", text: `VIES: ${d?.vies_status || d?.error || "no result"}.` }
    );
    await load();
    setBusy(false);
  }

  if (!brand) return <div className="rounded-xl border border-border p-4 bg-card text-xs text-muted-foreground">Loading billing identity…</div>;

  const b2bConfirmed = brand.tax_customer_type === "business_taxable_person";

  return (
    <div className="rounded-xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center gap-2">
        <Receipt size={14} />
        <p className="text-sm font-bold">Billing & tax identity</p>
      </div>
      <p className="text-xs text-muted-foreground">
        The legal details printed on the invoice. France is charged TVA; Spain uses the EU reverse charge and needs a VAT number validated in VIES.
      </p>

      <div className="grid sm:grid-cols-2 gap-2">
        {FIELDS.map(([k, label]) => (
          <input
            key={k}
            value={form[k]}
            onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setPreview(null); }}
            placeholder={label}
            aria-label={label}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
          />
        ))}
        <select
          value={form.billing_country}
          onChange={(e) => { setForm({ ...form, billing_country: e.target.value }); setPreview(null); }}
          aria-label="Billing country"
          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
        >
          <option value="FR">France (TVA)</option>
          <option value="ES">Spain (reverse charge)</option>
        </select>
      </div>

      <div className="text-xs p-2 rounded-lg bg-secondary/40 flex items-center gap-3 flex-wrap">
        <span>VIES: <b>{brand.vies_status || "not_checked"}</b></span>
        {brand.vies_checked_at && <span className="text-muted-foreground">checked {String(brand.vies_checked_at).slice(0, 10)}</span>}
        <span data-testid="b2b-status">
          B2B: <b className={b2bConfirmed ? "text-emerald-700" : "text-amber-800"}>
            {b2bConfirmed ? `confirmed (${brand.tax_evidence_status || "evidence not recorded"})` : "not confirmed"}
          </b>
        </span>
      </div>

      {!b2bConfirmed && (
        <p data-testid="b2b-blocker-note" className="text-[11px] text-amber-800 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 leading-snug">
          Invoicing will block with <code>customer_not_confirmed_b2b</code> until taxable-person status is
          confirmed against evidence. That block is the intended behaviour, not a bug — saving this form
          does not clear it.
        </p>
      )}

      {preview && (
        <div data-testid="identity-preview" className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1.5">
          <p className="text-xs font-bold text-sky-900">Confirm this change</p>
          <ul className="text-[11px] text-sky-900 space-y-0.5">
            {preview.preview.changes.map((change) => (
              <li key={change.field}>
                <b>{change.field}</b>: {String(change.from || "(empty)")} → {String(change.to || "(empty)")}
                {change.clears_existing_value && <span className="font-bold text-rose-700"> — clears a stored value</span>}
              </li>
            ))}
          </ul>
          {preview.preview.consequences.length > 0 && (
            <ul data-testid="identity-consequences" className="text-[11px] text-rose-800 space-y-0.5 pt-1 border-t border-sky-200">
              {preview.preview.consequences.map((line) => (
                <li key={line} className="flex items-start gap-1"><ShieldAlert size={11} className="mt-0.5 shrink-0" />{line}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <button disabled={busy} onClick={applyPreview} className="h-7 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50">
              Confirm and save
            </button>
            <button disabled={busy} onClick={() => setPreview(null)} className="h-7 px-3 rounded-lg border border-border text-xs font-bold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-700" : "text-amber-800"}`}>{msg.text}</p>}

      <div className="flex gap-2 flex-wrap">
        <button disabled={busy || Boolean(preview)} onClick={requestPreview} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50">
          {busy ? "Working…" : "Review changes"}
        </button>
        <button disabled={busy || !brand.vat_number} onClick={validateVies} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
          <BadgeCheck size={12} /> Validate in VIES
        </button>
        <button disabled={busy || b2bConfirmed} onClick={confirmB2b} className="h-8 px-3 rounded-lg border border-border text-xs font-bold disabled:opacity-50">
          Confirm B2B status
        </button>
      </div>
    </div>
  );
}
