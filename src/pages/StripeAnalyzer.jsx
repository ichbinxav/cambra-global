import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CreditCard, Shield, Lock, Zap, CheckCircle2, AlertTriangle, TrendingDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import StripeConnectFlow from "@/components/stripe/StripeConnectFlow";
import StripeResults from "@/components/stripe/StripeResults";

export default function StripeAnalyzer() {
  const [phase, setPhase] = useState("intro"); // intro | connecting | connected | analyzing | results
  const [mockData, setMockData] = useState(null);
  const navigate = useNavigate();

  const handleConnect = () => setPhase("connecting");
  const handleConnected = (data) => {
    setMockData(data);
    setPhase("results");
  };

  return (
    <div className="min-h-screen bg-background font-inter flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link to="/ConnectTools" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <span className="text-sm font-black tracking-tight">CAMBRA</span>
          <span className="text-muted-foreground/30">/</span>
          <span className="text-sm text-muted-foreground/60">Stripe Analyzer</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
          <Lock size={11} />
          <span>Secure, read-only access</span>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-10">
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                    style={{ background: "#635BFF18", border: "1px solid #635BFF30" }}>
                    <span style={{ color: "#635BFF" }}>ST</span>
                  </div>
                  <div>
                    <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50">Payments · Live connection</p>
                    <h1 className="text-xl font-black tracking-tight">Connect Stripe</h1>
                  </div>
                </div>

                <h2 className="text-[clamp(1.8rem,4vw,2.5rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4">
                  See your real<br />payment fees.
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                  We pull your last 30 days of transactions, calculate your effective fee rate, and compare it against the CAMBRA network benchmark for your revenue tier and country.
                </p>
              </div>

              {/* What we fetch */}
              <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">What we analyze</p>
                </div>
                <div className="divide-y divide-border/30">
                  {[
                    { label: "Total payment volume", desc: "Last 30 days", icon: CreditCard },
                    { label: "Total fees paid", desc: "All transaction costs", icon: TrendingDown },
                    { label: "Effective fee rate", desc: "Your real % vs benchmark", icon: Zap },
                    { label: "Savings potential", desc: "Annual estimate if optimized", icon: CheckCircle2 },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                      <item.icon size={13} className="text-muted-foreground/35 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground/45">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security guarantees */}
              <div className="space-y-2">
                {[
                  { icon: Lock, text: "Read-only access — we never modify your data" },
                  { icon: Shield, text: "Tokens stored server-side, never exposed to browser" },
                  { icon: CheckCircle2, text: "Instant analysis based on your real transactions" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground/60">
                    <item.icon size={11} className="text-green-500 shrink-0" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="space-y-3">
                <Button
                  onClick={handleConnect}
                  size="lg"
                  className="w-full h-14 rounded-xl text-sm font-bold gap-2"
                  style={{ background: "#635BFF" }}
                >
                  <CreditCard size={16} />
                  Connect Stripe Account
                  <ArrowRight size={14} />
                </Button>
                <p className="text-center text-[11px] text-muted-foreground/40">
                  Uses Stripe OAuth · Secure redirect · No card required
                </p>
              </div>

              {/* Skip to manual */}
              <div className="text-center">
                <Link to="/Analyzer" className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors underline underline-offset-2">
                  Skip — enter manually instead
                </Link>
              </div>
            </motion.div>
          )}

          {(phase === "connecting" || phase === "connected" || phase === "analyzing") && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <StripeConnectFlow onComplete={handleConnected} />
            </motion.div>
          )}

          {phase === "results" && mockData && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <StripeResults data={mockData} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}