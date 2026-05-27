import HeroSystemic from "@/components/landing/HeroSystemic.jsx";
import RecoverableMarginVisual from "@/components/landing/RecoverableMarginVisual.jsx";
import HowItWorksSimple from "@/components/landing/HowItWorksSimple.jsx";
import PricingSection from "@/components/landing/PricingSection.jsx";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import MeetTheFounder from "@/components/landing/MeetTheFounder.jsx";
import FooterSection from "@/components/landing/FooterSection";
import Navbar from "@/components/landing/Navbar";
import SectionTransition from "@/components/landing/SectionTransition.jsx";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      <Navbar />

      <main>
        {/* 1 — Hidden margin leaks (hero) */}
        <HeroSystemic />

        <SectionTransition variant="strong" />

        {/* 2 — Potential recoverable margin (money visual under hero) */}
        <RecoverableMarginVisual />

        <SectionTransition />

        {/* 3 — Free audit + benchmarks (the 4 steps) */}
        <div id="how">
          <HowItWorksSimple />
        </div>

        <SectionTransition />

        {/* 4 — Intelligence first, Recovery second (alignment model) */}
        <div id="pricing">
          <PricingSection />
        </div>

        <SectionTransition />

        {/* 5 — Operator findings */}
        <TestimonialsSection />

        <SectionTransition />

        {/* Founder */}
        <MeetTheFounder />
      </main>

      <FooterSection />
    </div>
  );
}