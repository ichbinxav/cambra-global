import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    name: "Free Audit",
    price: "€0",
    desc: "Perfect to discover your margin leaks",
    features: [
      "Complete infrastructure audit",
      "8-layer benchmarking analysis",
      "Estimated savings report",
      "Infrastructure score",
      "AI insights & recommendations",
    ],
    cta: "Start Free Audit",
    ctaHref: "/Analyzer",
    variant: "outline",
  },
  {
    name: "Premium",
    price: "Custom",
    desc: "For brands ready to activate deals",
    features: [
      "Everything in Free Audit",
      "Deal negotiation support",
      "Network access & volume pricing",
      "Implementation tracking",
      "Dedicated account manager",
      "Monthly optimization reports",
    ],
    cta: "Get Started",
    ctaHref: "/Onboarding",
    variant: "default",
    highlight: true,
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <div className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-12">
            <h1 className="text-[clamp(2.2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4">
              Transparent pricing
            </h1>
            <p className="text-base text-muted-foreground/70 max-w-xl mx-auto">
              Start free. Scale with confidence. Only pay when you activate deals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-8 ${
                  plan.highlight
                    ? "border-foreground/20 bg-foreground/5 ring-2 ring-foreground/10"
                    : "border-border/40 bg-card"
                }`}
              >
                <h3 className="text-2xl font-black mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground/70 mb-6">{plan.desc}</p>
                <div className="mb-8">
                  <span className="text-4xl font-black">{plan.price}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-chart-1 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link to={plan.ctaHref} className="w-full">
                  <Button variant={plan.variant} className="w-full h-12 rounded-full font-bold gap-2">
                    {plan.cta} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-16 p-8 rounded-2xl border border-border/40 bg-secondary/50">
            <h3 className="text-lg font-black mb-4">Frequently asked questions</h3>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-semibold mb-1">Is the audit really free?</p>
                <p className="text-muted-foreground/70">Yes, completely. No credit card required. You get a full benchmarking report.</p>
              </div>
              <div>
                <p className="font-semibold mb-1">When do I pay?</p>
                <p className="text-muted-foreground/70">Only if you activate deals through CAMBRA. We share a percentage of the savings we help you recover.</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Can I cancel anytime?</p>
                <p className="text-muted-foreground/70">Of course. No lock-in contracts. Cancel or pause deals whenever you want.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}