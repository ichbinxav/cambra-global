import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import RecoverBillingTable from "@/components/admin/recoverBilling/RecoverBillingTable";

function CompanyFiscalIdentity() {
  const [identity, setIdentity] = useState(null);

  useEffect(() => {
    let active = true;
    base44.functions.invoke("getAdminOperationsCockpit", {})
      .then((response) => {
        const data = response?.data || response;
        if (active) setIdentity(data?.company_identity || null);
      })
      .catch(() => { if (active) setIdentity(null); });
    return () => { active = false; };
  }, []);

  if (!identity) return null;
  const internal = identity.internal_fiscal_profile;
  return (
    <section className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">CAMBRA supplier identity</p>
          <h2 className="text-sm font-black mt-1">{identity.legal_name}</h2>
          <p className="text-xs text-muted-foreground mt-1">{identity.legal_form} · SIREN {identity.siren} · SIRET {identity.siret} · VAT {identity.vat_id}</p>
          <p className="text-xs text-muted-foreground">{identity.registered_address}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Created {identity.creation_date} · APE {identity.activity_code} · Year end {identity.fiscal_year_end}</p>
        </div>
        <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 ${internal ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}>
          Internal tax profile {internal ? "configured" : "required"}
        </span>
      </div>
      {internal && (
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
          <div className="rounded-lg bg-secondary/40 p-2"><b>IS</b><br />{internal.corporate_income_tax.regime} · ROF {internal.corporate_income_tax.rof}</div>
          <div className="rounded-lg bg-secondary/40 p-2"><b>TVA</b><br />{internal.vat.regime} · ROF {internal.vat.rof} · CA3 {internal.vat.ca3_frequency}</div>
          <div className="rounded-lg bg-secondary/40 p-2"><b>CFE</b><br />ROF {internal.cfe.rof}</div>
          <div className="rounded-lg bg-secondary/40 p-2"><b>CVAE</b><br />{internal.cvae.regime} · ROF {internal.cvae.rof}</div>
          <div className="rounded-lg bg-secondary/40 p-2"><b>RCM</b><br />ROF {internal.rcm.rof}</div>
        </div>
      )}
    </section>
  );
}

export default function AdminRecoverBilling() {
  return <div className="space-y-4"><CompanyFiscalIdentity /><RecoverBillingTable /></div>;
}
