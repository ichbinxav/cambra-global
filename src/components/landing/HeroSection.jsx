import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">
      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Background node symbol — static, no animation */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[50vw] font-thin text-foreground/[0.018] select-none pointer-events-none leading-none">
        ✱
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-5 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span className="text-[11px] font-medium text-muted-foreground">Infrastructure network · Powering independent commerce</span>
        </div>

        {/* Headline — instant render, no delay */}
        <h1 className="text-[clamp(2.8rem,9vw,8rem)] font-black tracking-[-0.04em] leading-[0.88] mb-6">
          Stop overpaying<br />
          for your<br />
          infrastructure.
        </h1>

        {/* Subheadline */}
        <p className="text-[clamp(1rem,2.5vw,1.4rem)] text-muted-foreground leading-relaxed mb-10 max-w-lg mx-auto">
          See exactly how much you can save in 2 minutes.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link to="/Analyzer" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-bold shadow-lg gap-2">
              Run the Analyzer
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/Onboarding" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-medium border-border/70">
              Join THE NoDE
            </Button>
          </Link>
        </div>

        {/* Social proof line */}
        <p className="mt-10 text-[12px] text-muted-foreground/50">
          Brands save an average of <strong className="text-foreground/70">€18,000 – €72,000/year</strong> through THE NoDE network
        </p>

        {/* Stats row */}
        <div className="mt-14 grid grid-cols-3 gap-4 max-w-md mx-auto">
          {[
            { value: "€29K", label: "Avg. annual savings" },
            { value: "1.4%", label: "Network payment rate" },
            { value: "−18%", label: "Avg. shipping savings" },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-xl font-black tracking-tight text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}