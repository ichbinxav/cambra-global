// Account — Checkpoint H (2026-08-06).
//
// LANGUAGE FIX: the page was English-only, including the "Saved" toast that fires
// on every field edit and every form label and placeholder.
//
// UNCHANGED: the SECURITY-1 ownership scoping in the queries, and both update
// calls (same entity, same field, same payload). This is a presentation fix.
//
// The two duplicated "labelled inputs that save on blur" blocks now share
// AccountFieldSection, and their field definitions live in accountFields.js —
// the `field` names written to the entities are unchanged.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { LogOut, User, Building2, Shield, Store, Mail, Settings } from "lucide-react";
import MonthlyEmailPreference from "@/components/account/MonthlyEmailPreference";
import RecoverCommitmentsCard from "@/components/account/RecoverCommitmentsCard";
import PageHero from "@/components/shared/PageHero";
import AccountFieldSection from "@/components/account/AccountFieldSection";
import { BRAND_FIELDS, PAYMENTS_PROFILE_FIELDS } from "@/components/account/accountFields";
import { useTranslation } from "@/lib/i18n.jsx";

const Section = ({ icon: IconComp, title, children }) => (
  <div className="cambra-card p-6">
    <div className="relative">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 rounded-lg border border-white/10 bg-white/[0.05] flex items-center justify-center">
          <IconComp size={13} className="text-cambra-cyan" />
        </div>
        <p className="cc-eyebrow">{title}</p>
      </div>
      {children}
    </div>
  </div>
);

export default function Account() {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [brands, setBrands] = useState([]);
  const [paymentsProfiles, setPaymentsProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // SECURITY-1 — ownership scoping in the query itself (defense in depth on
    // top of RLS): only MY brand and MY payments profile, never a bare .list().
    base44.auth.me().then((u) =>
      Promise.all([
        base44.entities.Brand.filter({ created_by: u.email }, "-created_date", 1),
        base44.entities.PaymentsProfile.filter({ created_by: u.email }, "-created_date", 1),
      ]).then(([b, p]) => {
        setUser(u);
        setBrands(b);
        setPaymentsProfiles(p);
        setLoading(false);
      })
    );
  }, []);

  const brand = brands[0];
  const paymentsProfile = paymentsProfiles[0];

  const updatePaymentsProfile = async (field, value) => {
    if (paymentsProfile) {
      await base44.entities.PaymentsProfile.update(paymentsProfile.id, { [field]: value });
      setPaymentsProfiles([{ ...paymentsProfile, [field]: value }]);
      toast.success(t("acc_saved"));
    }
  };

  const updateBrand = async (field, value) => {
    if (brand) {
      await base44.entities.Brand.update(brand.id, { [field]: value });
      setBrands([{ ...brand, [field]: value }]);
      toast.success(t("acc_saved"));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <span
        style={{
          display: "inline-block",
          width: 32, height: 32, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.12)",
          borderTopColor: "#39C6F0",
          animation: "cambra-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div>
      <PageHero
        eyebrow={t("acc_eyebrow")}
        title={t("acc_title")}
        subtitle={t("acc_subtitle")}
        icon={Settings}
      />

      <div className="max-w-2xl space-y-3">
        <Section icon={User} title={t("acc_s_profile")}>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">{t("acc_full_name")}</Label>
              <p className="text-sm font-semibold text-white">{user?.full_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">{t("acc_email")}</Label>
              <p className="text-sm font-semibold text-white">{user?.email || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">{t("acc_role")}</Label>
              <span className="inline-flex items-center text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.05] text-white/75">
                {user?.role || t("acc_role_member")}
              </span>
            </div>
          </div>
        </Section>

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

        <Section icon={Mail} title={t("acc_s_email_notif")}>
          <MonthlyEmailPreference user={user} onUpdate={setUser} />
        </Section>

        <RecoverCommitmentsCard />

        <Section icon={Shield} title={t("acc_s_session")}>
          <p className="text-sm text-white/55 mb-5">{t("acc_session_text")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => base44.auth.logout()}
            className="h-9 rounded-full px-5 text-xs font-medium gap-2 bg-white/[0.04] border-white/10 text-white hover:bg-white/10 hover:text-white"
          >
            <LogOut size={12} />
            {t("acc_signout")}
          </Button>
        </Section>
      </div>
    </div>
  );
}