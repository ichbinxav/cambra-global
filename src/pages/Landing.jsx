import HeroSystemic from "@/components/landing/HeroSystemic.jsx";
import HowItWorksSimple from "@/components/landing/HowItWorksSimple.jsx";
import StackIntelligenceMap from "@/components/landing/StackIntelligenceMap.jsx";
import ConnectToolsSection from "@/components/landing/ConnectToolsSection.jsx";
import PricingSection from "@/components/landing/PricingSection.jsx";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import MeetTheFounder from "@/components/landing/MeetTheFounder.jsx";
import FooterSection from "@/components/landing/FooterSection";
import Navbar from "@/components/landing/Navbar";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      <Navbar />

      <main>
        {/* 1 — Plain-English hero */}
        <HeroSystemic />

        {/* 2 — Three simple steps */}
         <div id="how">
           <HowItWorksSimple />
         </div>

         {/* 3 — Connect your tools (priority path for accuracy) */}
         <ConnectToolsSection />

         {/* 4 — Pricing */}
         <div id="pricing">
           <PricingSection />
         </div>

         {/* 5 — Living stack map */}
         <StackIntelligenceMap />

         {/* 6 — Operator findings (short, cold, specific) */}
         <TestimonialsSection />

        {/* 7 — Meet the founder */}
        <MeetTheFounder />
      </main>

      <FooterSection />
    </div>
  );
}