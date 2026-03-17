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

const ANALYZER_STEPS = ["Profile", "Revenue", "Channels", "Payments", "Shipping", "Stack"];

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

    // Calculate savings
    const annualRev = data.monthly_revenue * 12;
    const benchPaymentRate = 1.4;
    const paymentSavings = Math.round(annualRev * ((data.payment_fee_pct - benchPaymentRate) / 100));
    const shippingOptimal = data.monthly_shipping_cost * 0.82;
    const shippingSavings = Math.round((data.monthly_shipping_cost - shippingOptimal) * 12);
    const saasBenchmark = data.total_saas_spend * 0.7;
    const saasSavings = Math.round((data.total_saas_spend - saasBenchmark) * 12);
    const totalSavings = paymentSavings + shippingSavings + saasSavings;

    // Score: lower fee = better, more savings potential = lower score
    const paymentScore = Math.max(0, 100 - ((data.payment_fee_pct - 1.4) * 30));
    const shippingScore = Math.max(0, 100 - ((data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1) - 5) * 5));
    const saasScore = Math.max(0, 100 - (data.total_saas_spend / 50));
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
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">Let's analyze your business</h2>
            <p className="text-muted-foreground text-center mb-8">Tell us a bit about your brand.</p>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Brand name</Label>
              <Input value={data.brand_name} onChange={e => update("brand_name", e.target.value)} placeholder="Your brand" className="h-12" />
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">Revenue</h2>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Monthly revenue (€)</Label>
              <div className="text-3xl font-bold text-center">€{data.monthly_revenue.toLocaleString()}</div>
              <Slider value={[data.monthly_revenue]} onValueChange={v => update("monthly_revenue", v[0])} min={5000} max={500000} step={5000} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>€5K</span><span>€500K</span></div>
            </div>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Monthly transactions</Label>
              <div className="text-2xl font-bold text-center">{data.monthly_transactions.toLocaleString()}</div>
              <Slider value={[data.monthly_transactions]} onValueChange={v => update("monthly_transactions", v[0])} min={50} max={10000} step={50} />
            </div>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Average order value (€)</Label>
              <div className="text-2xl font-bold text-center">€{data.avg_order_value}</div>
              <Slider value={[data.avg_order_value]} onValueChange={v => update("avg_order_value", v[0])} min={10} max={500} step={5} />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">Channel mix</h2>
            <p className="text-muted-foreground text-center text-sm mb-4">Adjust the sliders to match your revenue split.</p>
            {[
              { key: "dtc_pct", label: "DTC / Website" },
              { key: "marketplace_pct", label: "Marketplaces" },
              { key: "wholesale_pct", label: "Wholesale" },
              { key: "retail_pct", label: "Retail" },
            ].map(ch => (
              <div key={ch.key} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{ch.label}</span>
                  <span className="font-semibold">{data[ch.key]}%</span>
                </div>
                <Slider value={[data[ch.key]]} onValueChange={v => update(ch.key, v[0])} min={0} max={100} step={5} />
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">Payments</h2>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Payment provider</Label>
              <Select value={data.payment_provider} onValueChange={v => update("payment_provider", v)}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {["Stripe", "Adyen", "Mollie", "PayPal", "Square", "Other"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Current fee rate (%)</Label>
              <div className="text-3xl font-bold text-center">{data.payment_fee_pct}%</div>
              <Slider value={[data.payment_fee_pct]} onValueChange={v => update("payment_fee_pct", v[0])} min={0.5} max={5} step={0.1} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>0.5%</span><span>5%</span></div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">Shipping</h2>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Shipping provider</Label>
              <Select value={data.shipping_provider} onValueChange={v => update("shipping_provider", v)}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Other"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Monthly shipping spend (€)</Label>
              <div className="text-2xl font-bold text-center">€{data.monthly_shipping_cost.toLocaleString()}</div>
              <Slider value={[data.monthly_shipping_cost]} onValueChange={v => update("monthly_shipping_cost", v[0])} min={100} max={50000} step={100} />
            </div>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Monthly shipments</Label>
              <div className="text-2xl font-bold text-center">{data.monthly_shipments.toLocaleString()}</div>
              <Slider value={[data.monthly_shipments]} onValueChange={v => update("monthly_shipments", v[0])} min={10} max={10000} step={10} />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-8 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-2">SaaS & Tools</h2>
            <div className="space-y-4">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Total monthly SaaS spend (€)</Label>
              <div className="text-3xl font-bold text-center">€{data.total_saas_spend.toLocaleString()}</div>
              <Slider value={[data.total_saas_spend]} onValueChange={v => update("total_saas_spend", v[0])} min={0} max={10000} step={50} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>€0</span><span>€10K</span></div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-border">
        <motion.div className="h-full bg-foreground" animate={{ width: `${((step + 1) / ANALYZER_STEPS.length) * 100}%` }} transition={{ duration: 0.5 }} />
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">N✱DE Analyzer</span>
        <span className="text-xs text-muted-foreground">{ANALYZER_STEPS[step]}</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }} className="w-full max-w-lg">
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between px-6 py-6 border-t border-border">
        <Button variant="ghost" onClick={() => step === 0 ? navigate("/") : setStep(s => s - 1)} className="text-sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Home" : "Back"}
        </Button>
        {step < ANALYZER_STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="rounded-full px-8 text-sm">
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={runAnalysis} disabled={loading} className="rounded-full px-8 text-sm">
            {loading ? "Analyzing..." : "Run Analysis"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}