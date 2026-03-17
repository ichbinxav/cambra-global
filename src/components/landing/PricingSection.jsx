import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";
import SectionDivider from "@/components/shared/SectionDivider";

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6">
      <SectionDivider />
      <div className="max-w-3xl mx-auto text-center">
        <RevealOnScroll>
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-6">Pricing</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tighter mb-4">
            You only pay when your
            <br />
            <span className="text-muted-foreground/40">economics improve.</span>
          </h2>
        </RevealOnScroll>

        <RevealOnScroll delay={0.15}>
          <div className="mt-12 p-10 rounded-3xl border border-border bg-card">
            <div className="mb-6">
              <span className="text-muted-foreground line-through text-lg">€120/month</span>
              <div className="text-5xl font-bold tracking-tighter mt-2">Free</div>
              <p className="text-sm text-muted-foreground mt-2">For early network partners</p>
            </div>

            <div className="space-y-3 text-left max-w-xs mx-auto mb-10">
              {[
                "Full infrastructure analysis",
                "Network rate access",
                "Savings dashboard",
                "Member directory",
                "Quarterly benchmarks",
                "Priority support",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <Check className="h-4 w-4 text-foreground shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <Link to="/Onboarding">
              <Button size="lg" className="rounded-full px-10 text-sm tracking-wide group">
                Join as early partner
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}