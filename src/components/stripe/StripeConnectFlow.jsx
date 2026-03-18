import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CreditCard, BarChart3, Zap } from "lucide-react";

const STEPS = [
  { label: "Authenticating with Stripe", sub: "Secure OAuth handshake", icon: CreditCard, duration: 1400 },
  { label: "Fetching transaction data", sub: "Last 30 days · All charges", icon: BarChart3, duration: 1800 },
  { label: "Calculating effective fees", sub: "Volume, fees, net totals", icon: Zap, duration: 1200 },
  { label: "Running benchmark analysis", sub: "Comparing against network", icon: CheckCircle2, duration: 900 },
];

// Mock Stripe data — replace with real API call when secrets are set
function generateMockData() {
  const volume = 87340; // monthly volume in EUR
  const transactions = 1240;
  const effectiveFee = 2.74; // %
  const totalFees = Math.round(volume * (effectiveFee / 100));
  const benchmarkFee = 1.4;
  const savingsPct = effectiveFee - benchmarkFee;
  const monthlySavings = Math.round(volume * (savingsPct / 100));
  const annualSavings = monthlySavings * 12;
  const score = Math.max(0, Math.min(100, Math.round(100 - (effectiveFee - benchmarkFee) * 40)));

  return {
    // Account info
    account_name: "Your Brand",
    currency: "EUR",
    // Volume
    monthly_volume: volume,
    annual_volume_est: volume * 12,
    total_transactions: transactions,
    avg_order_value: Math.round(volume / transactions),
    // Fees
    total_fees_monthly: totalFees,
    effective_fee_pct: effectiveFee,
    // Benchmark
    benchmark_fee_pct: benchmarkFee,
    benchmark_status: effectiveFee > 2.9 ? "overpaying" : effectiveFee > 2.5 ? "average" : "optimized",
    // Savings
    monthly_savings_potential: monthlySavings,
    annual_savings_potential: annualSavings,
    // Score
    infra_score: score,
    // Fee breakdown
    fee_breakdown: [
      { label: "Processing fee", pct: 2.1, amount: Math.round(volume * 0.021) },
      { label: "Authorization fee", pct: 0.3, amount: Math.round(volume * 0.003) },
      { label: "Currency conversion", pct: 0.2, amount: Math.round(volume * 0.002) },
      { label: "Dispute / chargeback", pct: 0.14, amount: Math.round(volume * 0.0014) },
    ],
    // Recent charges sample
    top_fee_months: [
      { month: "Jan", fees: 2310, volume: 84200 },
      { month: "Feb", fees: 2190, volume: 79800 },
      { month: "Mar", fees: 2390, volume: 87340 },
    ],
  };
}

export default function StripeConnectFlow({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    let step = 0;
    const run = () => {
      if (step >= STEPS.length) {
        setTimeout(() => onComplete(generateMockData()), 400);
        return;
      }
      const duration = STEPS[step].duration;
      setTimeout(() => {
        setCompletedSteps(prev => [...prev, step]);
        step++;
        setCurrentStep(step);
        run();
      }, duration);
    };
    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-lg mx-auto mb-5"
          style={{ background: "#635BFF18", border: "1px solid #635BFF30" }}>
          <span style={{ color: "#635BFF" }}>ST</span>
        </div>
        <h2 className="text-2xl font-black tracking-[-0.03em] mb-2">Analyzing your Stripe account</h2>
        <p className="text-sm text-muted-foreground">This takes about 5 seconds</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const done = completedSteps.includes(i);
          const active = currentStep === i && !done;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: done || active ? 1 : 0.35 }}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                done ? "border-green-500/25 bg-green-500/[0.04]" :
                active ? "border-border bg-card" :
                "border-border/30 bg-background"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                done ? "bg-green-500/15" : active ? "bg-secondary" : "bg-secondary/40"
              }`}>
                {done ? (
                  <CheckCircle2 size={15} className="text-green-500" />
                ) : active ? (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin" />
                ) : (
                  <step.icon size={14} className="text-muted-foreground/25" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {step.label}
                </p>
                <p className="text-[11px] text-muted-foreground/40">{step.sub}</p>
              </div>
              {done && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] font-bold text-green-600 bg-green-500/[0.08] border border-green-500/15 px-2.5 py-1 rounded-full"
                >
                  Done
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Security note */}
      <p className="text-center text-[11px] text-muted-foreground/35">
        🔒 Read-only access · We never modify your data · Instant results
      </p>
    </div>
  );
}