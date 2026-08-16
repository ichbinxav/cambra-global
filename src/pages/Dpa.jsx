// DPA-1 (2026-08-16) — public Data Processing Agreement, same trilingual
// pattern as Terms/Privacy. This is the CAMBRA-as-PROCESSOR agreement that
// merchants accept; the CAMBRA-as-controller master used with our own
// suppliers is internal and is deliberately NOT published.
//
// The shared layout already renders the review-status notice on every legal
// page, so this page carries no separate draft banner — the honest signal is
// that notice plus the explicit version in `lastUpdated`.
import React from "react";
import LegalPageLayout from "@/components/shared/LegalPageLayout";
import { useTranslation } from "@/lib/i18n.jsx";
import en from "@/content/legal/en/dpa";
import fr from "@/content/legal/fr/dpa";
import es from "@/content/legal/es/dpa";

const CONTENT = { en, fr, es };

export default function Dpa() {
  const { lang, t } = useTranslation();
  const c = CONTENT[lang] || CONTENT.en;
  return (
    <LegalPageLayout
      badge={c.badge}
      title={c.title}
      sections={c.sections}
      lastUpdated={c.lastUpdated}
      backLabel={c.back}
      // Annex III delegates the sub-processor list to its own page — the
      // reference must be reachable, not just quoted in the text.
      relatedLinks={[{ to: "/Subprocessors", label: t("footer_subprocessors") }]}
    />
  );
}
