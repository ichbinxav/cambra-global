// /ForProviders content builders — localized via the i18n `t` function.
// Extracted from src/pages/ForProviders.jsx so the page holds layout only and
// every string resolves through the FR/ES/EN dictionaries.
import {
  ShieldCheck, Sparkles, LinkIcon, Search, Handshake, CheckCircle2, Globe,
} from "lucide-react";

export function buildListedTier(t) {
  return {
    eyebrow: t("fp_t1_eyebrow"),
    title: t("fp_t1_title"),
    tagline: t("fp_t1_tagline"),
    intro: t("fp_t1_intro"),
    requirements: [
      { icon: Globe,      title: t("fp_t1_r1_t"), body: t("fp_t1_r1_b") },
      { icon: ShieldCheck, title: t("fp_t1_r2_t"), body: t("fp_t1_r2_b") },
      { icon: LinkIcon,   title: t("fp_t1_r3_t"), body: t("fp_t1_r3_b") },
    ],
    benefits: [
      { icon: Search,       title: t("fp_t1_b1_t"), body: t("fp_t1_b1_b") },
      { icon: CheckCircle2, title: t("fp_t1_b2_t"), body: t("fp_t1_b2_b") },
    ],
    cost: t("fp_t1_cost"),
  };
}

export function buildPartnerTier(t) {
  return {
    eyebrow: t("fp_t2_eyebrow"),
    title: t("fp_t2_title"),
    tagline: t("fp_t2_tagline"),
    intro: t("fp_t2_intro"),
    requirements: [
      { icon: Sparkles, title: t("fp_t2_r1_t"), body: t("fp_t2_r1_b") },
      { icon: Handshake, title: t("fp_t2_r2_t"), body: t("fp_t2_r2_b") },
      { icon: LinkIcon, title: t("fp_t2_r3_t"), body: t("fp_t2_r3_b") },
    ],
    benefits: [
      { icon: Search,       title: t("fp_t2_b1_t"), body: t("fp_t2_b1_b") },
      { icon: CheckCircle2, title: t("fp_t2_b2_t"), body: t("fp_t2_b2_b") },
    ],
    cost: t("fp_t2_cost"),
  };
}

export function buildGuardrails(t) {
  return [
    { title: t("fp_g1_t"), body: t("fp_g1_b") },
    { title: t("fp_g2_t"), body: t("fp_g2_b") },
    { title: t("fp_g3_t"), body: t("fp_g3_b") },
  ];
}