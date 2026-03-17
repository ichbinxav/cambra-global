import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ANALYZER_STEPS = ["Brand", "Revenue", "Channels", "Payments", "Shipping", "Stack"];

export default function Analyzer() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    brand_name: "",
    monthly_revenue: 50000,
    monthly_transactions: 500,
    avg_order_value: 100,
    dtc_pct: 60,
    marketplace_pct: 20,
    wholesale_pct: 15,
    retail_pct: 5,
    payment_provider: "",
    payment_fee_pct: 2.9,
    shipping_provider: "",
    monthly_shipping_cost: 3000,
    monthly_shipments: 400,
    saas_tools: [],
    total_saas_spend: 1500,
  });
  const navigate = useNavigate();
  const update = (key, val) => setData(d => ({ ...d, [key]: val }));

  const runAnalysis = async () => {
    setLoading(true);
    const annualRev = data.monthly_revenue * 12;
    const benchPaymentRate = 1.4;
    const paymentSavings = Math.max(0, Math.round(annualRev * ((data.payment_fee_pct - benchPaymentRate) / 100)));
    const shippingOptimal = data.monthly_shipping_cost * 0.82;
    const shippingSavings = Math.round((data.monthly_shipping_cost - shippingOptimal) * 12);
    const saasBenchmark = data.total_saas_spend * 0.7;
    const saasSavings = Math.round((data.total_saas_spend - saasBenchmark) * 12);
    const totalSavings = paymentSavings + shippingSavings + saasSavings;

    const paymentScore = Math.max(0, Math.min(100, 100 - ((data.payment_fee_pct - 1.4) * 30)));
    const shippingScore = Math.max(0, Math.min(100, 100 - ((data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1) - 5) * 5)));
    const saasScore = Math.max(0, Math.min(100, 100 - (data.total_saas_spend / 50)));
    const infraScore = Math.round((paymentScore + shippingScore + saasScore) / 3);

    const input = await base44.entities.AnalyzerInput.create({
      monthly_revenue: data.monthly_revenue,
      monthly_transactions: data.monthly_transactions,
      avg_order_value: data.avg_order_value,
      channel_mix: { dtc_pct: data.dtc_pct, marketplace_pct: data.marketplace_pct, wholesale_pct: data.wholesale_pct, retail_pct: data.retail_pct },
      payment_provider: data.payment_provider,
      payment_fee_pct: data.payment_fee_pct,
      shipping_provider: data.shipping_provider,
      monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments,
      total_saas_spend: data.total_saas_spend,
    });

    const result = await base44.entities.AnalyzerResult.create({
      input_id: input.id,
      payment_savings: paymentSavings,
      shipping_savings: shippingSavings,
      saas_savings: saasSavings,
      total_savings: totalSavings,
      infra_score: infraScore,
      payment_benchmark: benchPaymentRate,
      shipping_benchmark: shippingOptimal,
      saas_benchmark: saasBenchmark,
      details: {
        payment_current_rate: data.payment_fee_pct,
        payment_optimal_rate: benchPaymentRate,
        shipping_current_avg: data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1),
        shipping_optimal_avg: shippingOptimal / Math.max(data.monthly_shipments, 1),
        saas_current_total: data.total_saas_spend,
        saas_optimal_total: saasBenchmark,
      }
    });

    navigate(`/Results?id=${result.id}`);
  };

  const slideVariants = {
    enter: { opacity: 0, x: 30 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  };

  const SliderField = ({ label, value, onChange, min, max, step: s = 1, format = v => v }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-sm font-semibold tabular-nums">{format(value)}</span>
      </div>
      <Slider value={[value]} onValueChange={v => onChange(v[0])} min={min} max={max} step={s} className="w-full" />
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 1 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">Your brand</h2>
              <p className="text-muted-foreground text-sm mt-2">Tell us a bit about your business.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Brand name</Label>
              <Input value={data.brand_name} onChange={e => update("brand_name", e.target.value)} placeholder="Your brand" className="h-12 text-sm" />
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 2 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">Revenue</h2>
            </div>
            <SliderField label="Monthly revenue" value={data.monthly_revenue} onChange={v => update("monthly_revenue", v)} min={5000} max={500000} step={5000} format={v => `€${v.toLocaleString()}`} />
            <SliderField label="Monthly transactions" value={data.monthly_transactions} onChange={v => update("monthly_transactions", v)} min={50} max={10000} step={50} format={v => v.toLocaleString()} />
            <SliderField label="Average order value" value={data.avg_order_value} onChange={v => update("avg_order_value", v)} min={10} max={500} step={5} format={v => `€${v}`} />
          </div>
        );
      case 2:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 3 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">Channel mix</h2>
              <p className="text-muted-foreground text-sm mt-2">Adjust your revenue split.</p>
            </div>
            {[
              { key: "dtc_pct", label: "DTC / Website" },
              { key: "marketplace_pct", label: "Marketplaces" },
              { key: "wholesale_pct", label: "Wholesale" },
              { key: "retail_pct", label: "Retail" },
            ].map(ch => (
              <SliderField key={ch.key} label={ch.label} value={data[ch.key]} onChange={v => update(ch.key, v)} min={0} max={100} step={5} format={v => `${v}%`} />
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 4 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">Payments</h2>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Payment provider</Label>
              <Select value={data.payment_provider} onValueChange={v => update("payment_provider", v)}>
                <SelectTrigger className="h-12 text-sm"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {["Stripe", "Adyen", "Mollie", "PayPal", "Square", "Other"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SliderField label="Current fee rate" value={data.payment_fee_pct} onChange={v => update("payment_fee_pct", v)} min={0.5} max={5} step={0.1} format={v => `${v}%`} />
            <div className="p-4 rounded-xl bg-secondary/50 text-xs text-muted-foreground">
              Network benchmark: <span className="font-semibold text-foreground">1.4%</span> — enterprise negotiated rate
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 5 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">Shipping</h2>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Shipping provider</Label>
              <Select value={data.shipping_provider} onValueChange={v => update("shipping_provider", v)}>
                <SelectTrigger className="h-12 text-sm"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Other"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SliderField label="Monthly shipping spend" value={data.monthly_shipping_cost} onChange={v => update("monthly_shipping_cost", v)} min={100} max={50000} step={100} format={v => `€${v.toLocaleString()}`} />
            <SliderField label="Monthly shipments" value={data.monthly_shipments} onChange={v => update("monthly_shipments", v)} min={10} max={10000} step={10} format={v => v.toLocaleString()} />
          </div>
        );
      case 5:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-2">Step 6 of 6</p>
              <h2 className="text-3xl font-bold tracking-tight">SaaS & Tools</h2>
            </div>
            <SliderField label="Total monthly SaaS spend" value={data.total_saas_spend} onChange={v => update("total_saas_spend", v)} min={0} max={10000} step={50} format={v => `€${v.toLocaleString()}`} />
            <div className="p-4 rounded-xl bg-secondary/50 text-xs text-muted-foreground">
              Average brands overspend on SaaS by <span className="font-semibold text-foreground">30%</span> — typically €15K+/year in redundant tools.
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-border/40">
        <motion.div
          className="h-full bg-foreground"
          animate={{ width: `${((step + 1) / ANALYZER_STEPS.length) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <span className="text-sm font-bold tracking-tight">THE Node Analyzer</span>
        <span className="text-xs text-muted-foreground tabular-nums">{ANALYZER_STEPS[step]}</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-lg"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-5 border-t border-border/40">
        <Button
          variant="ghost"
          onClick={() => step === 0 ? navigate("/") : setStep(s => s - 1)}
          className="text-sm h-9 rounded-full px-5 text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          {step === 0 ? "Home" : "Back"}
        </Button>
        {step < ANALYZER_STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="rounded-full px-7 text-sm h-9">
            Continue <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={runAnalysis} disabled={loading} className="rounded-full px-7 text-sm h-9">
            {loading ? "Analyzing..." : "Run Analysis →"}
          </Button>
        )}
      </div>
    </div>
  );
}