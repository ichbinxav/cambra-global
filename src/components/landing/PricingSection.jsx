import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

const features = [
  "Full infrastructure analysis",
  "Network rate access",
  "Savings dashboard & history",
  "Member directory (exclusive)",
  "Quarterly benchmarks",
  "FOR LIFESTYLE COMMERCE intelligence",
  "Priority access to network deals",
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-36 px-6 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-20 items-center">
          <div>
            <RevealOnScroll>
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
                <span className="w-4 h-px bg-border inline-block" /> Pricing
              </span>
              <h2 className="text-[clamp(2.4rem,5.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-8">
                You only pay when
                <br />
                <span className="text-foreground/20">your economics</span>
                <br />
                <span className="text-foreground/20">improve.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed text-[1.05rem]">
                We win when you win. No upfront cost, no risk. Join as an early partner and lock in access for free — permanently.
              </p>
            </RevealOnScroll>
          </div>

          <RevealOnScroll delay={0.15} direction="left">
            <div className="p-10 rounded-3xl border border-border bg-card shadow-sm">
              <div className="mb-8">
                <div className="flex items-baseline gap-3 mb-1.5">
                  <span className="text-6xl font-black tracking-tight">Free</span>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground line-through text-sm font-medium">€120/mo</span>
                    <span className="text-[10px] text-muted-foreground/60 tracking-wide">for early partners</span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-700 text-[11px] px-3 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Limited spots available
                </div>
              </div>

              <div className="space-y-3 mb-9">
                {features.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <Link to="/Onboarding">
                <Button size="lg" className="w-full rounded-xl h-12 text-sm font-semibold group shadow-sm">
                  Join as early partner
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>

              <p className="text-center text-[11px] text-muted-foreground/50 mt-5 italic">"We win when you win."</p>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}