import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import SolutionSection from "@/components/landing/SolutionSection";
import HowSection from "@/components/landing/HowSection";
import AnalyzerCTA from "@/components/landing/AnalyzerCTA";
import PricingSection from "@/components/landing/PricingSection";
import FooterSection from "@/components/landing/FooterSection";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowSection />
      <AnalyzerCTA />
      <PricingSection />
      <FooterSection />
    </div>
  );
}