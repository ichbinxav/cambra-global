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
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import StripeConnectCard from "@/components/connect/StripeConnectCard.jsx";
import StatementUploadCard from "@/components/paymentsAnalyzer/StatementUploadCard.jsx";
import { useTranslation } from "@/lib/i18n.jsx";

function CardSkeleton() {
  return (
    <div className="p-4 rounded-2xl border border-border/60 bg-card animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 bg-secondary rounded" />
          <div className="h-2.5 w-48 bg-secondary/60 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function ConnectTools() {
  const { t, lang } = useTranslation();
  const [brandId, setBrandId] = useState(null);
  const [loading, setLoading] = useState(true);
  // null = capability probe in flight (StatementUploadCard renders a skeleton).
  const [extractionLive, setExtractionLive] = useState(null);

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
    <div className="relative min-h-screen bg-background font-inter flex flex-col overflow-x-hidden">
      <Navbar />

      <main className="relative flex-1 max-w-2xl mx-auto w-full px-5 pt-20 pb-12 mt-14 space-y-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]">{t("ct_page_title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("ct_page_sub")}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            {/* Path 1 — the live, verified route. */}
            <StripeConnectCard brandId={brandId} />

            {/* Path 2 — everyone else: statements. */}
            <StatementUploadCard providerLabel="provider" extractionLive={extractionLive} />
          </>
        )}

        <div className="pt-6 border-t border-border/40 flex justify-end">
          <Link to="/Analyzer">
            <Button className="h-10 rounded-full px-5 text-sm font-bold gap-2 min-h-[44px] sm:min-h-0">
              {t("nav_analyzer")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
