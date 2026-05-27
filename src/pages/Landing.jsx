import HeroSection_Public from "@/components/landing/HeroSection_Public.jsx";
import ThreeLayersSection from "@/components/landing/ThreeLayersSection";
import ProblemSection_Public from "@/components/landing/ProblemSection_Public.jsx";
import HowCombinedSection from "@/components/landing/HowCombinedSection.jsx";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import CredibilitySection from "@/components/landing/CredibilitySection";
import ValuePropositionSection from "@/components/landing/ValuePropositionSection";
import FeatureDuoSection from "@/components/landing/FeatureDuoSection";
import FooterSection from "@/components/landing/FooterSection";
import AnalyzerCTA_Public from "@/components/landing/AnalyzerCTA_Public.jsx";
import { motion } from "framer-motion";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="/" aria-label="CAMBRA" className="text-sm font-black tracking-[0.16em] uppercase">CAMBRA</a>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#audit" className="text-muted-foreground/60 hover:text-foreground transition-colors text-xs font-medium tracking-wide">How it works</a>
            <a href="/Analyzer" className="text-muted-foreground/60 hover:text-foreground transition-colors text-xs font-medium tracking-wide">Audit</a>
            <a href="/Insights" className="text-muted-foreground/60 hover:text-foreground transition-colors text-xs font-medium tracking-wide">Intelligence</a>
          </nav>
          <a
            href="/Analyzer"
            className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold inline-flex items-center hover:opacity-90 transition"
          >
            Run Audit →
          </a>
        </div>
      </header>

      <main>
        <HeroSection_Public />
        <CredibilitySection />
        <ValuePropositionSection />
        <FeatureDuoSection />
        <div id="audit">
          <HowCombinedSection />
        </div>
        <ThreeLayersSection />
        <ProblemSection_Public />
        <AnalyzerCTA_Public />
        <PricingSection />
        <IntegrationsSection />
        <BenefitsSection />
        <TestimonialsSection />
      </main>

      <FooterSection />
    </div>
  );
}