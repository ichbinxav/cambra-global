import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, ArrowLeft, Upload, X, FileText, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STEPS = [
  { title: "Your brand", sub: "Tell us about your business so we can benchmark you accurately." },
  { title: "Revenue", sub: "Your revenue determines your infrastructure leverage and savings potential." },
  { title: "Sales channels", sub: "Different channels create different cost structures and opportunities." },
  { title: "Payments", sub: "We compare your current payment costs against the network benchmark of 1.4%." },
  { title: "Shipping", sub: "We benchmark your shipping rates against collective volume pricing." },
  { title: "SaaS & Tools", sub: "We identify redundant or overpriced tools against network group licenses." },
  { title: "Upload statements", sub: "Optional but recommended — for a more precise, AI-powered analysis." },
];

const PAYMENT_PROVIDERS = ["Stripe", "Adyen", "Mollie", "PayPal", "Klarna", "Square", "Braintree", "Worldpay"];
const SHIPPING_PROVIDERS = ["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Evri", "GLS"];
const CATEGORIES = ["Fashion", "Beauty", "Wellness", "Lifestyle", "Food & Beverage", "Home", "Tech", "Other"];

export default function Analyzer() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [customPayment, setCustomPayment] = useState("");
  const [customShipping, setCustomShipping] = useState("");
  const fileRef = useRef(null);

  const [data, setData] = useState({
    brand_name: "", category: "", country: "",
    monthly_revenue: 50000, monthly_transactions: 500, avg_order_value: 100,
    dtc_pct: 60, marketplace_pct: 20, wholesale_pct: 15, retail_pct: 5,
    payment_provider: "", payment_fee_pct: 2.9,
    shipping_provider: "", monthly_shipping_cost: 3000, monthly_shipments: 400,
    total_saas_spend: 1500,
  });
  const navigate = useNavigate();
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const handleUpload = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress(p => Math.min(p + 15, 90)), 200);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    clearInterval(interval);
    setUploadProgress(100);
    setUploadedFile({ name: file.name, url: file_url });
    setUploading(false);
  };

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

    const provider = data.payment_provider === "Other" ? customPayment : data.payment_provider;
    const shipper = data.shipping_provider === "Other" ? customShipping : data.shipping_provider;

    const input = await base44.entities.AnalyzerInput.create({
      monthly_revenue: data.monthly_revenue, monthly_transactions: data.monthly_transactions,
      avg_order_value: data.avg_order_value,
      channel_mix: { dtc_pct: data.dtc_pct, marketplace_pct: data.marketplace_pct, wholesale_pct: data.wholesale_pct, retail_pct: data.retail_pct },
      payment_provider: provider, payment_fee_pct: data.payment_fee_pct,
      shipping_provider: shipper, monthly_shipping_cost: data.monthly_shipping_cost,
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

  const SliderField = ({ label, value, onChange, min, max, s = 1, fmt = v => v }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="text-base font-black tabular-nums">{fmt(value)}</span>
      </div>
      <Slider value={[value]} onValueChange={v => onChange(v[0])} min={min} max={max} step={s} />
      <div className="flex justify-between text-[11px] text-muted-foreground/40">
        <span>{fmt(min)}</span><span>{fmt(max)}</span>
      </div>
    </div>
  );

  const ProviderGrid = ({ options, selected, onSelect, customValue, onCustomChange, customLabel = "Other (specify)" }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all ${selected === p ? "border-foreground bg-foreground text-background" : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onSelect("Other")}
          className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all ${selected === "Other" ? "border-foreground bg-foreground text-background" : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}>
          Other
        </button>
      </div>
      {selected === "Other" && (
        <Input
          value={customValue}
          onChange={e => onCustomChange(e.target.value)}
          placeholder="Enter provider name"
          className="h-12 text-sm border-border/60"
        />
      )}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Brand name</Label>
            <Input value={data.brand_name} onChange={e => set("brand_name", e.target.value)} placeholder="Your brand name" className="h-12 text-sm border-border/60" autoFocus />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Country</Label>
            <Input value={data.country} onChange={e => set("country", e.target.value)} placeholder="e.g. Germany, UK, Netherlands" className="h-12 text-sm border-border/60" />
            <p className="text-[11px] text-muted-foreground/50">Your geography affects shipping rates and payment setups.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => set("category", c)}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all ${data.category === c ? "border-foreground bg-foreground text-background" : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/50">We benchmark you against similar independent commerce brands.</p>
          </div>
        </div>
      );
      case 1: return (
        <div className="space-y-8">
          <SliderField label="Monthly revenue" value={data.monthly_revenue} onChange={v => set("monthly_revenue", v)} min={5000} max={500000} s={5000} fmt={v => `€${v.toLocaleString()}`} />
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground">
            Your revenue helps determine your leverage and infrastructure savings potential within the network.
          </div>
          <SliderField label="Monthly transactions" value={data.monthly_transactions} onChange={v => set("monthly_transactions", v)} min={50} max={10000} s={50} fmt={v => v.toLocaleString()} />
          <SliderField label="Average order value" value={data.avg_order_value} onChange={v => set("avg_order_value", v)} min={10} max={500} s={5} fmt={v => `€${v}`} />
        </div>
      );
      case 2: return (
        <div className="space-y-6">
          <p className="text-[12px] text-muted-foreground">Different sales channels create different cost structures and negotiation opportunities.</p>
          {[{ k: "dtc_pct", l: "DTC / Website" }, { k: "marketplace_pct", l: "Marketplaces (Amazon, etc.)" }, { k: "wholesale_pct", l: "Wholesale / B2B" }, { k: "retail_pct", l: "Retail / Physical" }].map(c => (
            <SliderField key={c.k} label={c.l} value={data[c.k]} onChange={v => set(c.k, v)} min={0} max={100} s={5} fmt={v => `${v}%`} />
          ))}
        </div>
      );
      case 3: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your payment provider</Label>
            <ProviderGrid options={PAYMENT_PROVIDERS} selected={data.payment_provider} onSelect={v => set("payment_provider", v)} customValue={customPayment} onCustomChange={setCustomPayment} />
          </div>
          <SliderField label="Current effective fee rate" value={data.payment_fee_pct} onChange={v => set("payment_fee_pct", v)} min={0.5} max={5} s={0.1} fmt={v => `${v.toFixed(1)}%`} />
          <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/15">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your rate</span>
              <span className="font-bold">{data.payment_fee_pct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Network benchmark</span>
              <span className="font-bold text-blue-600">1.4%</span>
            </div>
            {data.payment_fee_pct > 1.4 && (
              <div className="mt-3 pt-3 border-t border-blue-500/15 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">You're overpaying by</span>
                <span className="font-black text-foreground">€{Math.round(data.monthly_revenue * 12 * ((data.payment_fee_pct - 1.4) / 100)).toLocaleString()}/yr</span>
              </div>
            )}
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your shipping provider</Label>
            <ProviderGrid options={SHIPPING_PROVIDERS} selected={data.shipping_provider} onSelect={v => set("shipping_provider", v)} customValue={customShipping} onCustomChange={setCustomShipping} />
          </div>
          <SliderField label="Monthly shipping spend" value={data.monthly_shipping_cost} onChange={v => set("monthly_shipping_cost", v)} min={100} max={50000} s={100} fmt={v => `€${v.toLocaleString()}`} />
          <SliderField label="Monthly shipments" value={data.monthly_shipments} onChange={v => set("monthly_shipments", v)} min={10} max={10000} s={10} fmt={v => v.toLocaleString()} />
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground">
            We benchmark your per-shipment cost against collective volume pricing across the network.
          </div>
        </div>
      );
      case 5: return (
        <div className="space-y-6">
          <SliderField label="Total monthly SaaS spend" value={data.total_saas_spend} onChange={v => set("total_saas_spend", v)} min={0} max={10000} s={50} fmt={v => `€${v.toLocaleString()}`} />
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            Brands typically overspend on SaaS by <strong className="text-foreground">30%</strong> — averaging €15K+ in redundant or overpriced tools. We identify group licensing opportunities.
          </div>
        </div>
      );
      case 6: return (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Upload your invoices, statements, or exports for an AI-powered, more precise analysis. Your data is encrypted and never shared without consent.
          </p>

          {!uploadedFile ? (
            <div
              className="border-2 border-dashed border-border/50 rounded-2xl p-8 text-center hover:border-foreground/20 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
            >
              {uploading ? (
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden max-w-[200px] mx-auto">
                    <div className="h-full bg-foreground transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload size={24} className="mx-auto text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-semibold mb-1">Drop your file here, or click to upload</p>
                    <p className="text-[11px] text-muted-foreground/50">PDF, Excel, CSV, or images · Max 20MB</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground/40">Stripe statements · Shopify exports · Carrier invoices · SaaS billing</p>
                </div>
              )}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-xl border border-green-500/20 bg-green-500/[0.04]">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{uploadedFile.name}</p>
                <p className="text-[11px] text-muted-foreground/50">Uploaded — AI analysis included in your results</p>
              </div>
              <button onClick={() => setUploadedFile(null)} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">What we extract:</strong> GMV, payment fees, effective rates, shipping patterns, SaaS spend, provider names, and recurring cost signals.
          </div>
        </div>
      );
      default: return null;
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98">
        <span className="text-sm font-black tracking-tight">THE NoDE Analyzer</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/50 hidden sm:block">~2 minutes</span>
          <span className="text-xs font-semibold tabular-nums">{step + 1} / {STEPS.length}</span>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-10 pb-32">
          {/* Step header */}
          <div className="mb-8">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="text-2xl font-black tracking-tight mb-2">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground">{STEPS[step].sub}</p>
          </div>

          {renderStep()}
        </div>
      </div>

      {/* Sticky bottom nav — always visible */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 border-t border-border/40 bg-background/98 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => step === 0 ? navigate("/") : setStep(s => s - 1)}
          className="h-12 rounded-full px-5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Home" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={run}
            disabled={loading}
            className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                Analyzing...
              </>
            ) : (
              <>Run Analysis <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}