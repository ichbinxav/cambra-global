import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, LockKeyhole, LogOut, Mail, Settings, Shield, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import AccountFieldSection from "@/components/account/AccountFieldSection";
import { BRAND_FIELDS, PAYMENTS_PROFILE_FIELDS } from "@/components/account/accountFields";
import MonthlyEmailPreference from "@/components/account/MonthlyEmailPreference";
import RecoverCommitmentsCard from "@/components/account/RecoverCommitmentsCard";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

function Section({ icon: Icon, title, children, className = "" }) {
  return (
    <section className={`cambra-paper-card p-6 sm:p-7 ${className}`.trim()}>
      <div className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFEDFF] text-[#4D3DF1]"><Icon size={18} /></span>
        <h2 className="text-[18px] font-bold tracking-[-.025em] text-[#11182D]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Account() {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [brands, setBrands] = useState([]);
  const [paymentsProfiles, setPaymentsProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    base44.auth.me().then((currentUser) => Promise.all([
      base44.entities.Brand.filter({ created_by: currentUser.email }, "-created_date", 1),
      base44.entities.PaymentsProfile.filter({ created_by: currentUser.email }, "-created_date", 1),
    ]).then(([brandRows, profileRows]) => {
      if (cancelled) return;
      setUser(currentUser);
      setBrands(brandRows);
      setPaymentsProfiles(profileRows);
    })).catch(() => {
      if (!cancelled) toast.error(t("res_err_msg"));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [t]);

  const brand = brands[0];
  const paymentsProfile = paymentsProfiles[0];

  const updatePaymentsProfile = async (field, value) => {
    if (!paymentsProfile) return;
    await base44.entities.PaymentsProfile.update(paymentsProfile.id, { [field]: value });
    setPaymentsProfiles([{ ...paymentsProfile, [field]: value }]);
    toast.success(t("acc_saved"));
  };

  const updateBrand = async (field, value) => {
    if (!brand) return;
    await base44.entities.Brand.update(brand.id, { [field]: value });
    setBrands([{ ...brand, [field]: value }]);
    toast.success(t("acc_saved"));
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#D5D8E3] border-t-[#5B4CF5]" /></div>;
  }

  return (
    <div className="workspace-light-page pb-12">
      <header className="max-w-[900px]">
        <SectionLabel>{t("acc_eyebrow")}</SectionLabel>
        <h1 className="workspace-page-title mt-5">{t("acc_title")}</h1>
        <p className="workspace-page-lead mt-4">{t("acc_subtitle")}</p>
        <p className="mt-3 text-[11px] font-semibold text-[#7B8399]">{t("account_required_note")}</p>
      </header>

      <div className="mt-10 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <div className="space-y-6">
          {brand && (
            <Section icon={Building2} title={t("acc_s_brand")}>
              <AccountFieldSection fields={BRAND_FIELDS} record={brand} onSave={updateBrand} />
            </Section>
          )}

          {paymentsProfile && (
            <Section icon={Store} title={t("acc_s_tpe")}>
              <AccountFieldSection fields={PAYMENTS_PROFILE_FIELDS} record={paymentsProfile} onSave={updatePaymentsProfile} />
            </Section>
          )}

          <RecoverCommitmentsCard />
        </div>

        <aside className="space-y-6">
          <Section icon={User} title={t("acc_s_profile")}>
            <dl className="space-y-5">
              <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">{t("acc_full_name")}</dt><dd className="mt-1.5 text-[14px] font-bold text-[#11182D]">{user?.full_name || "—"}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">{t("acc_email")}</dt><dd className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#11182D]">{user?.email || "—"}<span className="inline-flex items-center gap-1 rounded-full bg-[#E7F8EF] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#17834F]"><CheckCircle2 size={10} /> {t("account_verified")}</span></dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">{t("acc_role")}</dt><dd className="mt-1.5 text-[13px] font-semibold capitalize text-[#39425C]">{user?.role || t("acc_role_member")}</dd></div>
            </dl>
          </Section>

          <Section icon={Mail} title={t("acc_s_email_notif")}>
            <MonthlyEmailPreference user={user} onUpdate={setUser} />
          </Section>

          <Section icon={Shield} title={t("account_security_title")}>
            <Link to="/ConnectTools" className="flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><LockKeyhole size={14} /> {t("account_manage_data")}</span><span aria-hidden="true">→</span></Link>
          </Section>

          <Section icon={Settings} title={t("acc_s_session")}>
            <p className="text-[12px] leading-relaxed text-[#677089]">{t("acc_session_text")}</p>
            <Button variant="outline" size="sm" onClick={() => base44.auth.logout()} className="mt-5 h-10 rounded-xl border-[#D8DCE8] bg-white px-4 text-xs font-bold text-[#1C2641] hover:bg-[#F4F3FF]">
              <LogOut size={13} /> {t("acc_signout")}
            </Button>
          </Section>
        </aside>
      </div>
    </div>
  );
}
