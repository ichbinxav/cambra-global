import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ArrowRight, ArrowLeft, Upload, CreditCard, Truck, Package, BarChart3, Building2, MapPin, Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DataIngestionStep from "@/components/analyzer/DataIngestionStep";
import AnalyzerHero from "@/components/analyzer/AnalyzerHero";
import AuditModulesGrid from "@/components/analyzer/AuditModulesGrid";
import CopilotPanel from "@/components/analyzer/CopilotPanel";
import SmartNumberField from "@/components/inputs/SmartNumberField.jsx";
import Navbar from "@/components/landing/Navbar";
import { computeInfraScore, calculateSavings, getBenchmarks } from "@/lib/scoreEngine";

const STEPS = [
  {
    title: "Your brand",
    sub: "Tell us about your business so we can benchmark you accurately.",
    why: "Your geography and category determine the most relevant benchmarks.",
    icon: Building2,
  },
  {
    title: "Revenue & scale",
    sub: "Your revenue determines your infrastructure leverage and savings potential.",
    why: "Larger volume = more negotiation leverage in the network.",
    icon: BarChart3,
  },
  {
    title: "Sales channels",
    sub: "Different channels create different cost structures and opportunities.",
    why: "Channel mix affects which infrastructure costs matter most for you.",
    icon: Package,
  },
  {
    title: "Pillar 1 · Payments — Online",
    sub: "We compare your Stripe / PayPal effective fees against the network benchmark of 1.4%.",
    why: "Online payment fees are often the single largest hidden infrastructure cost.",
    icon: CreditCard,
  },
  {
    title: "Pillar 1 · Payments — TPV",
    sub: "We review in-store card terminals, rental costs and effective physical payment rate.",
    why: "TPV / dataphones hide fixed fees that can be renegotiated through collective buying.",
    icon: Store,
  },
  {
    title: "Pillar 2 · Logistics (Carrier + 3PL)",
    sub: "We benchmark your carrier (DHL, FedEx) and 3PL / fulfillment rates against collective volume pricing.",
    why: "Network volume unlocks carrier and warehouse rates unavailable to individual brands.",
    icon: Truck,
  },
  {
    title: "Pillar 3 · Commerce SaaS",
    sub: "We identify redundant or overpriced commerce software (Shopify, Klaviyo, apps & plugins).",
    why: "Brands typically overspend on Commerce SaaS by 30% — mostly on duplicated apps.",
    icon: Package,
  },
  {
    title: "Connect your data",
    sub: "Choose how you want to provide your infrastructure data for the most accurate analysis.",
    why: "More connected data = sharper benchmarks and larger identified savings.",
    icon: Upload,
  },
];

const PAYMENT_PROVIDERS = ["Stripe", "Adyen", "Mollie", "PayPal", "Klarna", "Square", "Braintree", "Worldpay", "Checkout.com", "Shopify Payments"];
const SHIPPING_PROVIDERS = ["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Evri", "GLS", "Colissimo", "Chronopost"];
const TPE_PROVIDERS = ["Ingenico", "Worldline", "SumUp", "Zettle", "Square", "myPOS", "Adyen", "Stripe Terminal", "Verifone", "Nexi"];
const CATEGORIES = ["Fashion", "Beauty", "Wellness", "Lifestyle", "Food & Beverage", "Home", "Tech", "Other"];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Bosnia and Herzegovina",
  "Brazil", "Bulgaria", "Cambodia", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia",
  "Cyprus", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador", "Egypt", "Estonia", "Ethiopia",
  "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Honduras", "Hong Kong",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Japan",
  "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia",
  "Malta", "Mexico", "Moldova", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan",
  "Panama", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain",
  "Sri Lanka", "Sweden", "Switzerland", "Taiwan", "Thailand", "Tunisia", "Turkey", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela",
  "Vietnam", "Other",
];

export default function Analyzer() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const initialMode = urlParams.get("mode") || "hub";
  const initialModule = urlParams.get("module") || "";
  const [mode, setMode] = useState(initialMode);
  const [selectedModule, setSelectedModule] = useState(initialModule);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [customPayment, setCustomPayment] = useState("");
  const [customShipping, setCustomShipping] = useState("");
  const [customTpe, setCustomTpe] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const fileRef = useRef(null);

  const [data, setData] = useState({
    brand_name: "", category: "", country: "", sector: "",
    monthly_revenue: 50000, monthly_transactions: 500, avg_order_value: 100,
    dtc_pct: 60, marketplace_pct: 20, wholesale_pct: 15, retail_pct: 5, intl_pct: 0,
    payment_provider: "", payment_fee_pct: 2.9,
    shipping_provider: "", monthly_shipping_cost: 3000, monthly_shipments: 400,
    tpe_provider: "", terminal_count: 2, monthly_terminal_rental: 40, tpe_transaction_fee_pct: 1.4, in_store_gmv: 15000, in_store_avg_ticket: 45, card_mix_pct: 85, fixed_banking_fees: 15, maintenance_fees: 0, contract_duration_months: 24,
    total_saas_spend: 1500,
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  useEffect(() => {
    if (mode !== "questionnaire") return;

    if (selectedModule === "payments") setStep(3);
    else if (selectedModule === "tpe") setStep(4);
    else if (selectedModule === "logistics" || selectedModule === "shipping") setStep(5);
    else if (selectedModule === "saas") setStep(6);
    else if (selectedModule === "upload") setStep(7);
    else setStep(0);
  }, [mode, selectedModule]);

  const openQuestionnaire = (module = "") => {
    setSelectedModule(module);
    setMode("questionnaire");
    const nextUrl = module ? `/Analyzer?mode=questionnaire&module=${module}` : "/Analyzer?mode=questionnaire";
    window.history.replaceState({}, "", nextUrl);
  };

  const handleModuleSelect = (module) => {
    if (module === "upload") {
      openQuestionnaire("upload");
      return;
    }
    openQuestionnaire(module);
  };

  const handleCopilotPrompt = (prompt) => {
    if (prompt === "Analyze my payment fees" || prompt === "Find my biggest overpay") {
      openQuestionnaire("payments");
      return;
    }
    if (prompt === "Review my shipping costs" || prompt === "Review my logistics costs") {
      openQuestionnaire("logistics");
      return;
    }
    if (prompt === "Analyze my card terminals") {
      openQuestionnaire("tpe");
      return;
    }
    if (prompt === "Explain an invoice") {
      openQuestionnaire("upload");
      return;
    }
    openQuestionnaire("saas");
  };

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

    const isAuthed = await base44.auth.isAuthenticated();
    if (!isAuthed) {
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
      return;
    }
    const provider = data.payment_provider === "Other" ? customPayment : data.payment_provider;
    const shipper = data.shipping_provider === "Other" ? customShipping : data.shipping_provider;

    const tpeProvider = data.tpe_provider === "Other" ? customTpe : data.tpe_provider;

    const inputData = {
      monthly_revenue: data.monthly_revenue,
      avg_order_value: data.avg_order_value,
      intl_pct: data.intl_pct,
      payment_fee_pct: data.payment_fee_pct,
      monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments,
      total_saas_spend: data.total_saas_spend,
      country: data.country,
      payment_provider: provider,
      shipping_provider: shipper,
      tpe_provider: tpeProvider,
      terminal_count: data.terminal_count,
      monthly_terminal_rental: data.monthly_terminal_rental,
      tpe_transaction_fee_pct: data.tpe_transaction_fee_pct,
      in_store_gmv: data.in_store_gmv,
      in_store_avg_ticket: data.in_store_avg_ticket,
      card_mix_pct: data.card_mix_pct,
      fixed_banking_fees: data.fixed_banking_fees,
      maintenance_fees: data.maintenance_fees,
      contract_duration_months: data.contract_duration_months,
      dtc_pct: data.dtc_pct,
      marketplace_pct: data.marketplace_pct,
      wholesale_pct: data.wholesale_pct,
    };

    // Unified savings calculation (tier + geo aware)
    const savings = calculateSavings(inputData);
    const scoreReport = computeInfraScore(inputData, "manual");

    const input = await base44.entities.AnalyzerInput.create({
      monthly_revenue: data.monthly_revenue, monthly_transactions: data.monthly_transactions,
      avg_order_value: data.avg_order_value,
      country: data.country,
      category: data.category,
      channel_mix: { dtc_pct: data.dtc_pct, marketplace_pct: data.marketplace_pct, wholesale_pct: data.wholesale_pct, retail_pct: data.retail_pct, intl_pct: data.intl_pct },
      payment_provider: provider, payment_fee_pct: data.payment_fee_pct,
      shipping_provider: shipper, monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments, total_saas_spend: data.total_saas_spend,
      tpe_provider: tpeProvider, terminal_count: data.terminal_count,
      monthly_terminal_rental: data.monthly_terminal_rental, tpe_transaction_fee_pct: data.tpe_transaction_fee_pct,
      in_store_gmv: data.in_store_gmv, in_store_avg_ticket: data.in_store_avg_ticket,
      card_mix_pct: data.card_mix_pct, fixed_banking_fees: data.fixed_banking_fees,
      maintenance_fees: data.maintenance_fees, contract_duration_months: data.contract_duration_months,
    });
    const result = await base44.entities.AnalyzerResult.create({
      input_id: input.id,
      payment_savings: savings.paymentSavings,
      shipping_savings: savings.shippingSavings,
      saas_savings: savings.saasSavings,
      total_savings: savings.totalSavings,
      infra_score: scoreReport.total,
      details: savings.details,
    });
    navigate(`/Results?id=${result.id}`);
  };

// SliderField replaced by SmartNumberField for premium UX

  const ProviderGrid = ({ options, selected, onSelect, customValue, onCustomChange }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${selected === p ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onSelect("Other")}
          className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${selected === "Other" ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}>
          Other
        </button>
      </div>
      {selected === "Other" && (
        <Input
          value={customValue}
          onChange={e => onCustomChange(e.target.value)}
          placeholder="Search or enter your provider"
          className="h-12 text-sm border-border/60"
          autoFocus
        />
      )}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Brand name</Label>
            <Input
              value={data.brand_name}
              onChange={e => set("brand_name", e.target.value)}
              placeholder="Your brand name"
              className="h-12 text-sm border-border/60"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Country</Label>
            <div className="relative">
              <button
                onClick={() => setCountryOpen(v => !v)}
                className={`w-full h-12 px-3 rounded-md border text-sm text-left flex items-center justify-between transition-colors ${data.country ? "text-foreground" : "text-muted-foreground"} border-border/60 bg-transparent hover:border-foreground/30`}
              >
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="text-muted-foreground/50 shrink-0" />
                  {data.country || "Select your country"}
                </span>
                <span className="text-muted-foreground/40 text-xs">▾</span>
              </button>
              {countryOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                  {COUNTRIES.map(c => (
                    <button
                      key={c}
                      onClick={() => { set("country", c); setCountryOpen(false); }}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${data.country === c ? "bg-secondary font-semibold" : ""}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/50">Your geography affects shipping rates and payment setups.</p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Category</Label>
            <div className="space-y-2">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => set("category", c)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${data.category === c ? "border-foreground bg-foreground/5" : "border-border/40 hover:border-foreground/30"}`}>
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${data.category === c ? "border-foreground bg-foreground" : "border-border/60"}`}>
                    {data.category === c && <span className="text-background text-xs font-bold">✓</span>}
                  </div>
                  <span className={`text-sm font-medium ${data.category === c ? "text-foreground" : "text-muted-foreground"}`}>{c}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/50">We benchmark you against similar independent commerce brands.</p>
          </div>

          {/* Sector selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Sector</Label>
            <div className="grid grid-cols-2 gap-2">
              {['Fashion','Jewelry','Cosmetics','Other'].map(s => (
                <button key={s} onClick={() => set('sector', s)}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${data.sector === s ? 'border-foreground bg-foreground text-background' : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-8">
          <SmartNumberField
            label="Monthly revenue"
            value={data.monthly_revenue}
            onChange={v => set("monthly_revenue", Math.round(v))}
            min={1000}
            max={10000000}
            scale="log"
            prefix="€"
          />
          <div className="p-4 rounded-xl bg-blue-500/[0.05] border border-chart-1/20 text-[12px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Why this matters:</span> Your revenue determines your leverage. Brands above €500K/mo unlock the strongest network terms.
          </div>
          <SmartNumberField
            label="Monthly transactions"
            value={data.monthly_transactions}
            onChange={v => set("monthly_transactions", Math.round(v))}
            min={10}
            max={100000}
          />
          <SmartNumberField
            label="Average order value"
            value={data.avg_order_value}
            onChange={v => set("avg_order_value", Math.round(v))}
            min={1}
            max={1000}
            prefix="€"
          />
        </div>
      );

      case 2: return (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            DTC-heavy brands typically save most on payments. Wholesale-heavy brands save most on shipping and logistics.
          </div>
          {[
            { k: "dtc_pct", l: "DTC / Website" },
            { k: "marketplace_pct", l: "Marketplaces (Amazon, etc.)" },
            { k: "wholesale_pct", l: "Wholesale / B2B" },
            { k: "retail_pct", l: "Retail / Physical" },
          ].map(c => (
            <SmartNumberField key={c.k} label={c.l} value={data[c.k]} onChange={v => set(c.k, Math.round(v))} min={0} max={100} suffix="%" />
          ))}

          <SmartNumberField
            label="% International Sales"
            value={data.intl_pct}
            onChange={v => set('intl_pct', Math.round(v))}
            min={0}
            max={100}
            suffix="%"
          />
        </div>
      );

      case 3: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your payment provider</Label>
            <ProviderGrid
              options={PAYMENT_PROVIDERS}
              selected={data.payment_provider}
              onSelect={v => set("payment_provider", v)}
              customValue={customPayment}
              onCustomChange={setCustomPayment}
            />
          </div>
          <SmartNumberField
            label="Current effective fee rate"
            value={data.payment_fee_pct}
            onChange={v => set("payment_fee_pct", Number(Number(v).toFixed(1)))}
            min={0.5}
            max={5}
            decimals={1}
            suffix="%"
          />
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const benchmark = bm.payment.rate;
            const annualSavings = Math.max(0, Math.round(data.monthly_revenue * 12 * ((data.payment_fee_pct - benchmark) / 100)));
            return (
              <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-chart-1/20 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your current rate</span>
                  <span className="font-bold tabular-nums">{data.payment_fee_pct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network target ({bm.tier} tier{bm.eu ? " · EU" : ""})</span>
                  <span className="font-bold text-chart-1 tabular-nums">{benchmark.toFixed(1)}%</span>
                </div>
                {data.payment_fee_pct > benchmark && (
                  <div className="pt-2 border-t border-chart-1/20 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Optimization potential</span>
                    <span className="font-black text-lg text-foreground tabular-nums">
                      €{annualSavings.toLocaleString()}/yr
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 5: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your carrier / 3PL provider</Label>
            <ProviderGrid
              options={SHIPPING_PROVIDERS}
              selected={data.shipping_provider}
              onSelect={v => set("shipping_provider", v)}
              customValue={customShipping}
              onCustomChange={setCustomShipping}
            />
          </div>
          <SmartNumberField
            label="Monthly shipping spend"
            value={data.monthly_shipping_cost}
            onChange={v => set("monthly_shipping_cost", Math.round(v))}
            min={100}
            max={100000}
            prefix="€"
            scale="log"
          />
          <SmartNumberField
            label="Monthly shipments"
            value={data.monthly_shipments}
            onChange={v => set("monthly_shipments", Math.round(v))}
            min={10}
            max={100000}
            scale="log"
          />
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const costPerShipment = data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1);
            const gap = Math.max(0, costPerShipment - bm.shipping.perUnit);
            const annualSaving = Math.round(gap * Math.max(data.monthly_shipments, 1) * 12);
            return (
              <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed space-y-1.5">
                <div className="flex justify-between">
                  <span>Your cost/shipment</span>
                  <span className="font-bold text-foreground">€{costPerShipment.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Network target ({bm.tier} tier{bm.eu ? " · EU" : ""})</span>
                  <span className="font-bold text-chart-2">€{bm.shipping.perUnit.toFixed(2)}</span>
                </div>
                {annualSaving > 0 && (
                  <div className="flex justify-between border-t border-border/30 pt-1.5 mt-1.5">
                    <span>Optimization potential</span>
                    <span className="font-black text-foreground">€{annualSaving.toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 4: return (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            Tell us only the basics about your TPV / dataphones in store. If you don't know an exact number, a rough estimate is totally fine.
          </div>
          <div>
            <Label className="text-sm font-medium mb-3 block">Who gives you the card machines?</Label>
            <ProviderGrid
              options={TPE_PROVIDERS}
              selected={data.tpe_provider}
              onSelect={v => set("tpe_provider", v)}
              customValue={customTpe}
              onCustomChange={setCustomTpe}
            />
            <p className="text-[11px] text-muted-foreground/50 mt-2">For example: SumUp, Worldline, Square or your bank.</p>
          </div>
          <SmartNumberField
            label="How many card machines do you use?"
            value={data.terminal_count}
            onChange={v => set("terminal_count", Math.round(v))}
            min={1}
            max={100}
          />
          <SmartNumberField
            label="About how much do you pay each month for them?"
            value={data.monthly_terminal_rental}
            onChange={v => set("monthly_terminal_rental", Math.round(v))}
            min={0}
            max={5000}
            prefix="€"
          />
          <SmartNumberField
            label="Roughly how much do you sell in store each month?"
            value={data.in_store_gmv}
            onChange={v => set("in_store_gmv", Math.round(v))}
            min={0}
            max={1000000}
            prefix="€"
            scale="log"
          />
          <SmartNumberField
            label="What % do they usually charge per card payment?"
            value={data.tpe_transaction_fee_pct}
            onChange={v => set("tpe_transaction_fee_pct", Number(Number(v).toFixed(2)))}
            min={0}
            max={5}
            decimals={2}
            suffix="%"
          />
          <SmartNumberField
            label="Any extra fixed monthly fees from the bank or terminal provider?"
            value={(data.fixed_banking_fees || 0) + (data.maintenance_fees || 0)}
            onChange={v => {
              const rounded = Math.round(v);
              set("fixed_banking_fees", rounded);
              set("maintenance_fees", 0);
            }}
            min={0}
            max={5000}
            prefix="€"
          />
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const annualInStoreGmv = data.in_store_gmv * 12;
            const variableAnnual = annualInStoreGmv * ((data.tpe_transaction_fee_pct || 0) / 100);
            const fixedAnnual = ((data.monthly_terminal_rental || 0) + (data.fixed_banking_fees || 0) + (data.maintenance_fees || 0)) * 12;
            const effectiveRate = annualInStoreGmv > 0 ? ((variableAnnual + fixedAnnual) / annualInStoreGmv) * 100 : 0;
            const annualSavings = Math.max(0, Math.round(annualInStoreGmv * ((effectiveRate - bm.tpe.rate) / 100)));
            return (
              <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-chart-1/20 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your estimated all-in cost rate</span>
                  <span className="font-bold tabular-nums">{effectiveRate.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Typical collective rate</span>
                  <span className="font-bold text-chart-1 tabular-nums">{bm.tpe.rate.toFixed(2)}%</span>
                </div>
                {annualSavings > 0 && (
                  <div className="pt-2 border-t border-chart-1/20 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Possible yearly savings</span>
                    <span className="font-black text-lg text-foreground tabular-nums">€{annualSavings.toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 6: return (
        <div className="space-y-6">
          <SmartNumberField
            label="Total monthly Commerce SaaS spend"
            value={data.total_saas_spend}
            onChange={v => set("total_saas_spend", Math.round(v))}
            min={0}
            max={50000}
            prefix="€"
          />
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">What we check:</strong> Commerce platforms (Shopify, WooCommerce), email (Klaviyo), apps & plugins, and duplicated commerce tools. Brands typically overspend by <strong className="text-foreground">30%</strong>.
          </div>
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const saasRatio = data.monthly_revenue > 0 ? data.total_saas_spend / data.monthly_revenue : 0;
            const saasGap = Math.max(0, saasRatio - bm.saas.pct);
            const saving = Math.round(saasGap * data.monthly_revenue * 12);
            const optimal = Math.round(bm.saas.pct * data.monthly_revenue);
            return (
              <div className="p-4 rounded-xl bg-orange-500/[0.05] border border-chart-3/20 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your current spend</span>
                  <span className="font-bold tabular-nums">€{(data.total_saas_spend * 12).toLocaleString()}/yr</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network benchmark ({bm.tier})</span>
                  <span className="font-bold text-muted-foreground/60 tabular-nums">€{(optimal * 12).toLocaleString()}/yr</span>
                </div>
                {saving > 0 && (
                  <div className="flex items-center justify-between text-sm border-t border-chart-3/20 pt-1.5">
                    <span className="text-muted-foreground">Optimization potential</span>
                    <span className="font-black text-chart-3 tabular-nums">€{saving.toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 7: return (
        <DataIngestionStep
          uploadedFile={uploadedFile}
          setUploadedFile={setUploadedFile}
          uploading={uploading}
          uploadProgress={uploadProgress}
          fileRef={fileRef}
          handleUpload={handleUpload}
        />
      );

      default: return null;
    }
  };

  const canContinue = () => {
    if (step === 0) return data.brand_name.trim().length > 0;
    return true;
  };

  if (mode === "hub") {
    return (
      <div className="relative min-h-screen bg-background font-inter text-foreground overflow-hidden">
        <Navbar />
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 dot-grid opacity-50" />
          <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18]" />
          <div className="absolute top-1/3 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.15]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 pt-24 pb-10 md:px-8 md:pt-28 md:pb-12">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-8">
              <AnalyzerHero
                onStartFullAudit={() => openQuestionnaire("")}
                onUploadDocuments={() => openQuestionnaire("upload")}
              />
              <AuditModulesGrid onSelectModule={handleModuleSelect} />
            </div>
            <CopilotPanel onSelectPrompt={handleCopilotPrompt} />
          </div>
        </div>
      </div>
    );
  }

  const StepIcon = STEPS[step].icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="relative min-h-screen flex flex-col bg-background font-inter overflow-hidden">
      <Navbar />

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
        <div className="absolute top-1/2 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
      </div>

      {/* Gradient progress bar */}
      <div className="fixed top-14 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div className="h-full transition-all duration-500"
             style={{ width: `${progress}%`, background: "linear-gradient(90deg, #1F4ED8 0%, #2CA7C1 100%)", boxShadow: "0 0 12px rgba(44,167,193,0.6)" }} />
      </div>

      <div className="sticky top-14 z-40 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <span className="text-sm font-black tracking-tight">CAMBRA</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/50 hidden sm:block">~2 minutes</span>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6"
                    : i < step
                    ? "w-1.5"
                    : "w-1.5 bg-border"
                }`}
                style={
                  i === step
                    ? { background: "linear-gradient(90deg, #1F4ED8, #2CA7C1)", boxShadow: "0 0 8px rgba(44,167,193,0.5)" }
                    : i < step
                    ? { background: "#2CA7C1", opacity: 0.6 }
                    : {}
                }
              />
            ))}
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 pt-12 pb-36">
          {/* Premium DARK step header — landing-grade */}
          <div className="mb-10 relative rounded-3xl overflow-hidden border border-white/10 bg-[#06080F] text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
            {/* Ambient layers */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full blur-3xl"
                   style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.5), transparent 60%)" }} />
              <div className="absolute -bottom-32 -right-20 w-[24rem] h-[24rem] rounded-full blur-3xl"
                   style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent 60%)" }} />
              <div className="absolute inset-0 opacity-[0.08]"
                   style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />
            </div>

            <div className="relative p-6 sm:p-8">
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
                </span>
                <StepIcon size={10} className="text-white/60" />
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                  Step {step + 1} of {STEPS.length}
                </span>
              </div>

              <div className="mb-3">
                <div
                  className="font-display text-[5rem] sm:text-[6.5rem] font-black leading-[0.82] tracking-[-0.06em] tabular-nums select-none"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {String(step + 1).padStart(2, "0")}
                </div>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] leading-[1] mb-3">
                <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 60%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  {STEPS[step].title}
                </span>
              </h2>
              <p className="text-sm text-white/60 leading-relaxed">{STEPS[step].sub}</p>
            </div>
          </div>

          {renderStep()}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 border-t border-border/40 bg-background/95 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 0) {
              setMode("hub");
              window.history.replaceState({}, "", "/Analyzer");
              return;
            }
            setStep(s => s - 1);
          }}
          className="h-12 rounded-full px-5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Back to hub" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!canContinue()}
            className="h-12 rounded-full px-6 sm:px-8 text-sm font-bold gap-2 bg-saas-gradient text-white hover:opacity-90 shadow-[0_0_24px_rgba(44,167,193,0.35)]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={run}
            disabled={loading}
            className="h-12 rounded-full px-8 text-sm font-bold gap-2 bg-saas-gradient text-white hover:opacity-90 shadow-[0_0_32px_rgba(44,167,193,0.45)]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Analyzing...
              </>
            ) : (
              <>Analyze Infrastructure <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
  }