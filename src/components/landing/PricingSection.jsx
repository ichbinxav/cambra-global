import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

const features = [
  "Infrastructure Analyzer (unlimited runs)",
  "Full network benchmark access",
  "Payment rate optimization",
  "Shipping contract access",
  "SaaS group deals",
  "Savings history & tracking",
  "Member network directory",
  "Priority deal activation",
];

export default function PricingSection() {
  return (
    <section className="py-28 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          <RevealOnScroll>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Pricing
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4">
              Free — until<br />you save money.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-3 max-w-sm">
              No upfront cost. No subscription. Join the network and start saving immediately.
            </p>
            <p className="text-sm font-semibold text-foreground">
              Average savings per brand: <span className="text-blue-600">€18,000 – €72,000/year</span>
            </p>
          </RevealOnScroll>

          <RevealOnScroll delay={0.1} direction="left">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-7 py-6 border-b border-border/40">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-black">Free</span>
                  <span className="text-muted-foreground text-sm">to join · early partner</span>
                </div>
                <p className="text-sm text-muted-foreground">Your savings pay for the network.</p>
              </div>

              <div className="px-7 py-6 space-y-3">
                {features.map(f => (
                  <div key={f} className="flex items-start gap-3">
                    <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                    <span className="text-sm">{f}</span>
                  </div>
                ))}
              </div>

              <div className="px-7 pb-7">
                <Link to="/Onboarding">
                  <Button className="w-full h-12 rounded-xl text-sm font-bold gap-2 shadow-sm">
                    Join THE NoDE — free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-[11px] text-muted-foreground/50 text-center mt-3">
                  Early partners get permanent preferential terms · Limited spots
                </p>
              </div>
            </div>
          </RevealOnScroll>

        </div>
      </div>
    </section>
  );
}