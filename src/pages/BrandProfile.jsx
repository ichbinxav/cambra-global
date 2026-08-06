import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import CompanyBlock from "@/components/onboarding/CompanyBlock";
import { useLanguage } from "@/lib/i18n.jsx";

export default function BrandProfile() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur border-b border-white/[0.08] px-5 py-3.5" style={{ background: "rgba(10,10,10,0.7)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link to="/Onboarding" className="text-sm text-white/55 hover:text-white inline-flex items-center gap-1">
            <ArrowLeft size={14} /> {t("bp_back")}
          </Link>
          <h1 className="ml-auto text-base font-bold text-white">{t("bp_title")}</h1>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
        <div className="cambra-card p-5">
          <div className="relative">
            <h2 className="text-xl font-black tracking-[-0.02em] mb-1 text-white">{t("bp_h2")}</h2>
            <p className="text-sm text-white/55">Name, country, category, and basics to personalize your analysis.</p>
          </div>
        </div>

        {/* Brand form */}
        <div className="cambra-card p-4">
          <div className="relative">
            <CompanyBlock />
          </div>
        </div>
      </div>
    </div>
  );
}