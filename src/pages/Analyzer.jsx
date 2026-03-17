import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STEPS = ["Brand", "Revenue", "Channels", "Payments", "Shipping", "Stack"];

export default function Analyzer() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    brand_name: "",
    monthly_revenue: 50000, monthly_transactions: 500, avg_order_value: 100,
    dtc_pct: 60, marketplace_pct: 20, wholesale_pct: 15, retail_pct: 5,
    payment_provider: "", payment_fee_pct: 2.9,
    shipping_provider: "", monthly_shipping_cost: 3000, monthly_shipments: 400,
    total_saas_spend: 1500,
  });
  const navigate = useNavigate();
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const run = async () => {
    setLoading(true);
    const annualRev = data.monthly_revenue * 12;
    const BENCHMARK_PAYMENT = 1.4;
    const paymentSavings = Math.max(0, Math.round(annualRev * ((data.payment_fee_pct - BENCHMARK_PAYMENT) / 100)));
    const shippingOpt = data.monthly_shipping_cost * 0.82;
    const shippingSavings = Math.round((data.monthly_shipping_cost - shippingOpt) * 12);
    const saasOpt = data.total_saas_spend * 0.7;
    const saasSavings = Math.round((data.total_saas_spend - saasOpt) * 12);
    const totalSavings = paymentSavings + shippingSavings + saasSavings;
    const payScore = Math.max(0, Math.min(100, 100 - (data.payment_fee_pct - BENCHMARK_PAYMENT) * 30));
    const shipScore = Math.max(0, Math.min(100, 100 - (data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1) - 5) * 5));
    const saasScore = Math.max(0, Math.min(100, 100 - data.total_saas_spend / 50));
    const infraScore = Math.round((payScore + shipScore + saasScore) / 3);

    const input = await base44.entities.AnalyzerInput.create({
      monthly_revenue: data.monthly_revenue, monthly_transactions: data.monthly_transactions,
      avg_order_value: data.avg_order_value,
      channel_mix: { dtc_pct: data.dtc_pct, marketplace_pct: data.marketplace_pct, wholesale_pct: data.wholesale_pct, retail_pct: data.retail_pct },
      payment_provider: data.payment_provider, payment_fee_pct: data.payment_fee_pct,
      shipping_provider: data.shipping_provider, monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments, total_saas_spend: data.total_saas_spend,
    });
    const result = await base44.entities.AnalyzerResult.create({
      input_id: input.id, payment_savings: paymentSavings, shipping_savings: shippingSavings,
      saas_savings: saasSavings, total_savings: totalSavings, infra_score: infraScore,
      payment_benchmark: BENCHMARK_PAYMENT, shipping_benchmark: shippingOpt, saas_benchmark: saasOpt,
      details: {
        payment_current_rate: data.payment_fee_pct, payment_optimal_rate: BENCHMARK_PAYMENT,
        shipping_current_avg: data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1),
        shipping_optimal_avg: shippingOpt / Math.max(data.monthly_shipments, 1),
        saas_current_total: data.total_saas_spend, saas_optimal_total: saasOpt,
      }
    });
    navigate(`/Results?id=${result.id}`);
  };

  const Field = ({ label, hint, children }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground/60">{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5"><Info size={9} /> {hint}</span>}
      </div>
      {children}
    </div>
  );

  const SliderField = ({ label, hint, value, onChange, min, max, s = 1, fmt = v => v }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/60">{label}</span>
          {hint && <span className="text-[10px] text-muted-foreground/40">{hint}</span>}
        </div>
        <span className="text-sm font-bold tabular-nums">{fmt(value)}</span>
      </div>
      <Slider value={[value]} onValueChange={v => onChange(v[0])} min={min} max={max} step={s} />
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">1 of 6</p><h2 className="text-3xl font-black tracking-tight">Your brand</h2><p className="text-muted-foreground text-sm mt-2">Tell us about your business.</p></div>
          <Field label="Brand name">
            <Input value={data.brand_name} onChange={e => set("brand_name", e.target.value)} placeholder="Your brand" className="h-12 text-sm border-border/60" />
          </Field>
        </div>
      );
      case 1: return (
        <div className="space-y-8 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">2 of 6</p><h2 className="text-3xl font-black tracking-tight">Revenue</h2></div>
          <SliderField label="Monthly revenue" hint="Total GMV" value={data.monthly_revenue} onChange={v => set("monthly_revenue", v)} min={5000} max={500000} s={5000} fmt={v => `€${v.toLocaleString()}`} />
          <SliderField label="Monthly transactions" value={data.monthly_transactions} onChange={v => set("monthly_transactions", v)} min={50} max={10000} s={50} fmt={v => v.toLocaleString()} />
          <SliderField label="Average order value" value={data.avg_order_value} onChange={v => set("avg_order_value", v)} min={10} max={500} s={5} fmt={v => `€${v}`} />
        </div>
      );
      case 2: return (
        <div className="space-y-8 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">3 of 6</p><h2 className="text-3xl font-black tracking-tight">Channel mix</h2><p className="text-muted-foreground text-sm mt-2">Adjust your revenue split.</p></div>
          {[{ k: "dtc_pct", l: "DTC / Website" }, { k: "marketplace_pct", l: "Marketplaces" }, { k: "wholesale_pct", l: "Wholesale" }, { k: "retail_pct", l: "Retail" }].map(c => (
            <SliderField key={c.k} label={c.l} value={data[c.k]} onChange={v => set(c.k, v)} min={0} max={100} s={5} fmt={v => `${v}%`} />
          ))}
        </div>
      );
      case 3: return (
        <div className="space-y-8 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">4 of 6</p><h2 className="text-3xl font-black tracking-tight">Payments</h2></div>
          <Field label="Payment provider">
            <Select value={data.payment_provider} onValueChange={v => set("payment_provider", v)}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>{["Stripe", "Adyen", "Mollie", "PayPal", "Square", "Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <SliderField label="Current fee rate" hint="%" value={data.payment_fee_pct} onChange={v => set("payment_fee_pct", v)} min={0.5} max={5} s={0.1} fmt={v => `${v.toFixed(1)}%`} />
          <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/15 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Network benchmark: 1.4%</span> — enterprise-negotiated rate across THE NoDE network.
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-8 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">5 of 6</p><h2 className="text-3xl font-black tracking-tight">Shipping</h2></div>
          <Field label="Shipping provider">
            <Select value={data.shipping_provider} onValueChange={v => set("shipping_provider", v)}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>{["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <SliderField label="Monthly shipping spend" value={data.monthly_shipping_cost} onChange={v => set("monthly_shipping_cost", v)} min={100} max={50000} s={100} fmt={v => `€${v.toLocaleString()}`} />
          <SliderField label="Monthly shipments" value={data.monthly_shipments} onChange={v => set("monthly_shipments", v)} min={10} max={10000} s={10} fmt={v => v.toLocaleString()} />
        </div>
      );
      case 5: return (
        <div className="space-y-8 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">6 of 6</p><h2 className="text-3xl font-black tracking-tight">SaaS & Tools</h2></div>
          <SliderField label="Total monthly SaaS spend" value={data.total_saas_spend} onChange={v => set("total_saas_spend", v)} min={0} max={10000} s={50} fmt={v => `€${v.toLocaleString()}`} />
          <div className="p-4 rounded-xl bg-secondary/50 text-[11px] text-muted-foreground border border-border/40">
            Brands in our network typically overspend on SaaS by <span className="font-semibold text-foreground">30%</span> — averaging €15K+ in redundant or overpriced tools annually.
          </div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-border/30">
        <motion.div className="h-full bg-foreground" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.5 }} />
      </div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <span className="text-sm font-black tracking-tight">THE NoDE Analyzer</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/40">{STEPS[step]}</span>
          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{step + 1}/{STEPS.length}</span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-lg">
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between px-6 py-5 border-t border-border/40">
        <Button variant="ghost" onClick={() => step === 0 ? navigate("/") : setStep(s => s - 1)} className="h-9 rounded-full px-5 text-sm text-muted-foreground">
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />{step === 0 ? "Home" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="h-9 rounded-full px-7 text-sm font-semibold shadow-sm">
            Continue <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={run} disabled={loading} className="h-9 rounded-full px-7 text-sm font-semibold shadow-sm">
            {loading ? "Analyzing..." : "Run Analysis →"}
          </Button>
        )}
      </div>
    </div>
  );
}