import HeroSystemic from "@/components/landing/HeroSystemic.jsx";
import InfrastructureHeatmap from "@/components/landing/InfrastructureHeatmap.jsx";
import CredibilitySection from "@/components/landing/CredibilitySection";
import ThreeLayersSection from "@/components/landing/ThreeLayersSection";
import PricingSection from "@/components/landing/PricingSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import FooterSection from "@/components/landing/FooterSection";
import Navbar from "@/components/landing/Navbar";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      <Navbar />

      <main>
        {/* 1 — Systemic hero with live signal terminal */}
        <HeroSystemic />

        {/* 2 — Credibility strip (peer brands / press) */}
        <CredibilitySection />

        {/* 3 — THE iconic moment: live infrastructure heatmap */}
        <InfrastructureHeatmap />

        {/* 4 — Three-layer mechanism (audit → benchmark → act) */}
        <div id="how">
          <ThreeLayersSection />
        </div>

        {/* 5 — Pricing */}
        <div id="pricing">
          <PricingSection />
        </div>

        {/* 6 — Operator quotes (short, cold, specific) */}
        <TestimonialsSection />
      </main>

      <FooterSection />
    </div>
  );
}