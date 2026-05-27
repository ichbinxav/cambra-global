import HeroSystemic from "@/components/landing/HeroSystemic.jsx";
import OperationalTension from "@/components/landing/OperationalTension.jsx";
import StackIntelligenceMap from "@/components/landing/StackIntelligenceMap.jsx";
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

        {/* 2 — Economic tension: dense facts, sharp positioning */}
        <OperationalTension />

        {/* 3 — THE iconic visual: living stack intelligence map */}
        <div id="how">
          <StackIntelligenceMap />
        </div>

        {/* 4 — Pricing */}
        <div id="pricing">
          <PricingSection />
        </div>

        {/* 5 — Operator findings (short, cold, specific) */}
        <TestimonialsSection />
      </main>

      <FooterSection />
    </div>
  );
}