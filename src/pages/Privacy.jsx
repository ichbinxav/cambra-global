// LEGAL-1 (2026-07-24) — trilingual legal content. The full text lives in
// per-language content files (src/content/legal/{en,fr,es}/privacy.js), NOT
// in the i18n dictionary: legal pages are long-form documents, and the
// dictionary is for UI strings. The existing language selector drives the
// choice via useTranslation().lang.
import LegalPageLayout from "@/components/shared/LegalPageLayout";
import { useTranslation } from "@/lib/i18n.jsx";
import en from "@/content/legal/en/privacy";
import fr from "@/content/legal/fr/privacy";
import es from "@/content/legal/es/privacy";

const CONTENT = { en, fr, es };

export default function Privacy() {
  const { lang } = useTranslation();
  const c = CONTENT[lang] || CONTENT.en;
  return (
    <LegalPageLayout
      badge={c.badge}
      title={c.title}
      sections={c.sections}
      lastUpdated={c.lastUpdated}
      backLabel={c.back}
    />
  );
}