// LEGAL-1 (2026-07-24) — trilingual legal content, same pattern as Privacy.
import LegalPageLayout from "@/components/shared/LegalPageLayout";
import { useTranslation } from "@/lib/i18n.jsx";
import en from "@/content/legal/en/terms";
import fr from "@/content/legal/fr/terms";
import es from "@/content/legal/es/terms";

const CONTENT = { en, fr, es };

export default function Terms() {
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