import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Receipt, BadgeCheck } from "lucide-react";

const FIELDS = [
  ["billing_legal_name", "Legal entity name"],
  ["billing_address_line1", "Address line 1"],
  ["billing_address_line2", "Address line 2 (optional)"],
  ["billing_postal_code", "Postal code"],
  ["billing_city", "City"],
  ["vat_number", "VAT number"],
];

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
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await base44.entities.Brand.filter({ id: brandId }, "-created_date", 1);
    const b = rows?.[0];
    setBrand(b);
    setForm({
      billing_legal_name: b?.billing_legal_name || "",
      billing_address_line1: b?.billing_address_line1 || "",
      billing_address_line2: b?.billing_address_line2 || "",
      billing_postal_code: b?.billing_postal_code || "",
      billing_city: b?.billing_city || "",
      billing_country: (b?.billing_country || "").toUpperCase() || "FR",
      vat_number: b?.vat_number || "",
    });
  }
  useEffect(() => { if (brandId) load(); }, [brandId]);

  async function save() {
    setBusy(true);
    setMsg(null);
    await base44.entities.Brand.update(brandId, {
      ...form,
      billing_country: form.billing_country.toUpperCase(),
      tax_customer_type: "business_taxable_person",
    });
    await load();
    setMsg({ kind: "ok", text: "Billing identity saved." });
    setBusy(false);
  }

  async function validateVies() {
    setBusy(true);
    setMsg(null);
    const res = await base44.functions.invoke("checkVatVies", { brand_id: brandId });
    const d = res?.data || res;
    setMsg(
      d?.vies_status === "valid"
        ? { kind: "ok", text: `VIES: valid — ${d.name || "name not returned"}.` }
        : { kind: "warn", text: `VIES: ${d?.vies_status || d?.error || "no result"}.` }
    );
    await load();
    setBusy(false);
  }

  if (!brand) return <div className="rounded-xl border border-border p-4 bg-card text-xs text-muted-foreground">Loading billing identity…</div>;

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
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            placeholder={label}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
          />
        ))}
        <select
          value={form.billing_country}
          onChange={(e) => setForm({ ...form, billing_country: e.target.value })}
          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
        >
          <option value="FR">France (TVA)</option>
          <option value="ES">Spain (reverse charge)</option>
        </select>
      </div>

      <div className="text-xs p-2 rounded-lg bg-secondary/40">
        VIES: <b>{brand.vies_status || "not_checked"}</b>
        {brand.vies_checked_at && <span className="text-muted-foreground"> · checked {brand.vies_checked_at.slice(0, 10)}</span>}
      </div>

      {msg && <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-700" : "text-amber-800"}`}>{msg.text}</p>}

      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50">
          {busy ? "Working…" : "Save"}
        </button>
        <button disabled={busy || !brand.vat_number} onClick={validateVies} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
          <BadgeCheck size={12} /> Validate in VIES
        </button>
      </div>
    </div>
  );
}