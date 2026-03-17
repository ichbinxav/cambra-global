import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

const features = [
  "Full infrastructure analysis",
  "Network rate access",
  "Savings dashboard & reports",
  "Member directory (exclusive)",
  "Quarterly benchmarks",
  "Priority support",
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-32 px-6 border-t border-border/40">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <RevealOnScroll>
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-5">Pricing</p>
              <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[0.92] mb-6">
                You only pay when
                <br />
                <span className="text-foreground/20">your economics improve.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg">
                We win when you win. No upfront cost, no risk. Join as an early partner and lock in access for free.
              </p>
            </RevealOnScroll>
          </div>

          <RevealOnScroll delay={0.15} direction="left">
            <div className="p-10 rounded-3xl border border-border bg-card">
              <div className="mb-8">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-5xl font-bold tracking-tight">Free</span>
                  <span className="text-muted-foreground line-through text-sm">€120/mo</span>
                </div>
                <p className="text-sm text-muted-foreground">For early network partners. Limited spots.</p>
              </div>

              <div className="space-y-3 mb-8">
                {features.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-background" />
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <Link to="/Onboarding">
                <Button size="lg" className="w-full rounded-xl h-12 text-sm tracking-wide group font-medium">
                  Join as early partner
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>

              <p className="text-center text-xs text-muted-foreground mt-4">"We win when you win."</p>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}