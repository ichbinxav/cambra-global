import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function FooterSection() {
  return (
    <>
      {/* Final CTA */}
      <section className="py-36 px-5 bg-foreground text-background relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-[50vw] font-thin text-background/[0.025] select-none pointer-events-none leading-none">
          ✱
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <p className="text-[10px] tracking-[0.3em] uppercase opacity-30 mb-8">Ready to save?</p>
          <h2 className="text-[clamp(2.5rem,7vw,7rem)] font-black tracking-[-0.04em] leading-[0.88] mb-10">
            Stop overpaying.<br />Start now.
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Analyzer" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 rounded-full px-10 text-base font-bold border-background/25 text-background hover:bg-background hover:text-foreground gap-2">
                Run the Analyzer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" variant="ghost" className="w-full h-14 rounded-full px-10 text-base text-background/50 hover:text-background hover:bg-background/10">
                Join THE NoDE
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer strip */}
      <footer className="py-10 px-5 border-t border-border/40 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <span className="text-sm font-black tracking-tight">THE NoDE</span>
            <span className="text-xs text-muted-foreground/40">Powering independent commerce</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground/50">
            <span>© {new Date().getFullYear()} THE NoDE</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}