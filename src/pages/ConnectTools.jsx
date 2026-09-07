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

import { useEffect, useRef, useState } from "react";
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

export default function ConnectTools() {
  const { t, lang } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const connectRef = useRef(null);
  const uploadRef = useRef(null);
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

  useEffect(() => {
    if (loading || !["connect", "upload"].includes(requestedMode)) return undefined;
    const target = requestedMode === "upload" ? uploadRef.current : connectRef.current;
    if (!target) return undefined;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [extractionLive, loading, requestedMode]);

  return (
    <div className="cambra-tool-page relative flex min-h-screen flex-col overflow-x-hidden font-inter">
      <Navbar />

      <main className="cambra-public-container relative flex-1 pb-16 pt-28 sm:pt-32">
        <header className="max-w-[930px]">
          <SectionLabel>{uploadMode ? t("az_entry_upload_title") : t("az_entry_connect_title")}</SectionLabel>
          <h1 className="mt-6 text-[clamp(40px,5.2vw,70px)] font-bold leading-[.98] tracking-[-.058em] text-[#081126]">
            {t("ct_page_title")}<span className="text-[#6657F7]">.</span>
          </h1>
          <p className="mt-5 max-w-[760px] text-[clamp(15px,1.35vw,18px)] leading-[1.65] text-[#626B86]">{t("ct_page_sub")}</p>
          <p className="mt-5 inline-flex items-center gap-2 text-[12px] font-bold text-[#4B5571]"><LockKeyhole size={15} className="text-[#5B4CF5]" /> {t("trust_sec_b1_t")} · {t("trust_sec_b4_t")}</p>
        </header>

        <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.42fr)_minmax(330px,.58fr)]">
          <section className="min-w-0">
            {loading ? (
              <CardSkeleton />
            ) : uploadMode ? (
              <div
                ref={uploadRef}
                id="statement-upload"
                tabIndex={-1}
                className="h-full scroll-mt-28 rounded-[28px] outline-none"
              >
                <StatementUploadCard providerLabel={genericProviderLabel} extractionLive={extractionLive} />
              </div>
            ) : (
              <div
                ref={connectRef}
                id="connect-provider"
                tabIndex={-1}
                className="h-full rounded-[28px] outline-none"
              >
                <StripeConnectCard brandId={brandId} />
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

        <section className="cambra-paper-card mt-6 p-6 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[17px] font-bold tracking-[-.025em] text-[#11182D]">{t("az_entry_label")}</p>
              <p className="mt-1 text-[12px] text-[#747C91]">{uploadMode ? t("az_entry_connect_subtitle") : t("az_entry_upload_subtitle")}</p>
            </div>
            <Link to="/Analyzer" className="hidden text-[12px] font-bold text-[#4D3DF1] sm:inline-flex sm:items-center sm:gap-2">{t("az_entry_manual_title")} <ArrowRight size={13} /></Link>
          </div>
          {!loading && (uploadMode ? (
            <div
              ref={connectRef}
              id="connect-provider"
              tabIndex={-1}
              className="rounded-[24px] outline-none"
            >
              <StripeConnectCard brandId={brandId} />
            </div>
          ) : (
            <div
              ref={uploadRef}
              id="statement-upload"
              tabIndex={-1}
              className="scroll-mt-28 rounded-[24px] outline-none"
            >
              <StatementUploadCard providerLabel={genericProviderLabel} extractionLive={extractionLive} />
            </div>
          ))}
          <Link to="/Analyzer" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D8DCE8] bg-white text-[12px] font-bold text-[#27314D] sm:hidden">{t("az_entry_manual_title")} <ArrowRight size={13} /></Link>
        </section>
      </main>
    </div>
  );
}
