import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import SolutionSection from "@/components/landing/SolutionSection";
import HowSection from "@/components/landing/HowSection";
import AnalyzerCTA from "@/components/landing/AnalyzerCTA";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import FooterSection from "@/components/landing/FooterSection";
// ForLifestyleSection removed — replaced by brand-aligned sections

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowSection />
      <AnalyzerCTA />
      <TestimonialsSection />
      <PricingSection />
      <FooterSection />
    </div>
  );
}