// ConnectTools — UX-1 T9 (2026-07-29): PAYMENTS-ONLY, TWO PATHS.
//
// The page used to list the whole integration catalog (PSP list, TPV list,
// commerce disclosure) where every non-Stripe row was "coming soon" — a wall
// of dead buttons that made the product look unfinished and buried the ONE
// path that actually works today.
//
// Now the page offers exactly the two things that are real:
//   1. Connect Stripe  → live OAuth, verified numbers (StripeConnectCard)
//   2. Upload your statements → the extractor fallback for any other provider
//      (StatementUploadCard, gated by the getUploadCapability probe so the
//      copy is honest when the extractor is off).
//
// No business logic changed: StripeConnectCard and the upload flow are the
// same components/endpoints as before. Only the catalog surface is removed.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BarChart3, CheckCircle2, FileSearch, LockKeyhole, Percent } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import StripeConnectCard from "@/components/connect/StripeConnectCard.jsx";
import StatementUploadCard from "@/components/paymentsAnalyzer/StatementUploadCard.jsx";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

function CardSkeleton() {
  return (
    <div className="cambra-paper-card min-h-[430px] animate-pulse p-7">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-[#EFEDFF]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 rounded bg-[#EAEBF1]" />
          <div className="h-3 w-56 rounded bg-[#F0F1F5]" />
        </div>
      </div>
    </div>
  );
}

export default function ConnectTools({ mode = undefined }) {
  const { t, lang } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestedMode = mode || searchParams.get("mode");
  const [brandId, setBrandId] = useState(null);
  const [loading, setLoading] = useState(true);
  // null = capability probe in flight (StatementUploadCard renders a skeleton).
  const [extractionLive, setExtractionLive] = useState(null);
  const uploadMode = requestedMode === "upload";
  const genericProviderLabel = String(t("az_provider_label")).toLocaleLowerCase(lang);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        if (me) {
          const brands = await base44.entities.Brand
            .filter({ created_by: me.email }, "-created_date", 1)
            .catch(() => []);
          let id = brands[0]?.id || null;
          // A brand-new user has no Brand yet. Without one, brandId stayed
          // null forever and "Connect Stripe" was stuck on "Loading…" — the
          // verified path was unreachable. Create the minimal workspace brand
          // (only `name` is required) so the OAuth start has a brand context.
          // The user renames it later in /BrandProfile.
          if (!id) {
            const created = await base44.entities.Brand.create({
              name: me.full_name || (me.email ? me.email.split("@")[0] : "My brand"),
              contact_email: me.email,
              contact_name: me.full_name,
              locale: lang, // EMAIL-1 T2 — welcome + monthly emails follow the UI language
            }).catch(() => null);
            id = created?.id || null;
          }
          setBrandId(id);
        }
      } finally {
        setLoading(false);
      }
      const res = await base44.functions.invoke("getUploadCapability", {}).catch(() => null);
      const body = res?.data || res;
      setExtractionLive(body?.extraction_live === true);
    })();
  }, []);

  return (
    <div className="cambra-tool-page relative flex min-h-screen flex-col overflow-x-hidden font-inter">
      <Navbar />

      <main className="cambra-public-container relative flex-1 pb-16 pt-28 sm:pt-32">
        <header className="max-w-[930px]">
          <SectionLabel>{uploadMode ? t("az_entry_upload_title") : t("az_entry_connect_title")}</SectionLabel>
          <h1 className="mt-6 text-[clamp(40px,5.2vw,70px)] font-bold leading-[.98] tracking-[-.058em] text-[#081126]">
            {uploadMode ? t("az_entry_upload_title") : t("ct_page_title")}<span className="text-[#6657F7]">.</span>
          </h1>
          <p className="mt-5 max-w-[760px] text-[clamp(15px,1.35vw,18px)] leading-[1.65] text-[#626B86]">
            {uploadMode ? t("az_entry_upload_body") : t("ct_page_sub")}
          </p>
          <p className="mt-5 inline-flex items-center gap-2 text-[12px] font-bold text-[#4B5571]"><LockKeyhole size={15} className="text-[#5B4CF5]" /> {t("trust_sec_b1_t")} · {t("trust_sec_b4_t")}</p>
        </header>

        <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.42fr)_minmax(330px,.58fr)]">
          <section className="min-w-0">
            {loading ? (
              <CardSkeleton />
            ) : uploadMode ? (
              <div id="statement-upload" className="h-full rounded-[28px]">
                <StatementUploadCard providerLabel={genericProviderLabel} extractionLive={extractionLive} />
              </div>
            ) : (
              <div id="connect-provider" className="h-full rounded-[28px]">
                <StripeConnectCard brandId={brandId} redirectAfter="/ConnectStripe" />
              </div>
            )}
          </section>

          <aside className="cambra-dark-panel flex min-h-[430px] flex-col justify-between p-7 sm:p-8">
            <div>
              <SectionLabel tone="dark">{uploadMode ? t("overlay_step_4") : t("az_entry_connect_subtitle")}</SectionLabel>
              <h2 className="mt-6 text-[clamp(25px,3vw,38px)] font-bold leading-[1.05] tracking-[-.045em] text-white">
                {uploadMode ? t("az_entry_upload_subtitle") : t("az_entry_connect_title")}
              </h2>
              <ul className="mt-8 divide-y divide-white/10">
                {(uploadMode
                  ? [
                      { icon: FileSearch, text: t("overlay_step_1") },
                      { icon: CheckCircle2, text: t("overlay_step_2") },
                      { icon: BarChart3, text: t("overlay_step_4") },
                    ]
                  : [
                      { icon: BarChart3, text: t("az_lbl_gmv") },
                      { icon: FileSearch, text: t("acc_banking_fees") },
                      { icon: Percent, text: t("dh_eff_rate") },
                    ]
                ).map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-4 py-5 text-[14px] font-semibold text-white/84 first:pt-0">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#8B7BFF]/25 bg-[#8B7BFF]/12 text-[#B6ABFF]"><Icon size={17} /></span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-7 border-t border-white/10 pt-6 text-[12px] leading-relaxed text-white/58">
              {uploadMode ? t("az_entry_upload_body") : t("az_entry_connect_body")}
            </p>
          </aside>
        </div>

        <nav className="mt-6 grid gap-3 sm:grid-cols-3" aria-label={t("az_entry_label")}>
          <Link to="/ConnectStripe" className={`cambra-paper-card flex min-h-20 items-center justify-between gap-4 px-5 py-4 text-[12px] font-bold ${!uploadMode ? "border-[#7C6CF8] text-[#4D3DF1]" : "text-[#27314D]"}`}>{t("az_entry_connect_title")} <ArrowRight size={14} /></Link>
          <Link to="/UploadStatement" className={`cambra-paper-card flex min-h-20 items-center justify-between gap-4 px-5 py-4 text-[12px] font-bold ${uploadMode ? "border-[#7C6CF8] text-[#4D3DF1]" : "text-[#27314D]"}`}>{t("az_entry_upload_title")} <ArrowRight size={14} /></Link>
          <Link to="/Analyzer" className="cambra-paper-card flex min-h-20 items-center justify-between gap-4 px-5 py-4 text-[12px] font-bold text-[#27314D]">{t("az_entry_manual_title")} <ArrowRight size={14} /></Link>
        </nav>
      </main>
    </div>
  );
}
