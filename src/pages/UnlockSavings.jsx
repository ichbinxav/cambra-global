import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight, CheckCircle2, Lock, FileSignature, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/shared/Toast.jsx";
import RouteProbe from "@/components/dev/RouteProbe";

/**
 * Unlock Savings — converts an estimated savings opportunity into a real
 * DealActivation + Recommendation in 'awaiting_authorization' status.
 * This is the single canonical entry point for moving from analysis -> recovery.
 */
export default function UnlockSavings() {
  const { toast } = useToast();
  const [results, setResults] = useState([]);
  const [recs, setRecs] = useState([]);
  const [activations, setActivations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [user, setUser] = useState(null);

  const load = async () => {
    setLoading(true);
    const me = await base44.auth.me().catch(() => null);
    setUser(me);
    const [r, rec, act] = await Promise.all([
      base44.entities.AnalyzerResult.list("-created_date", 20).catch(() => []),
      base44.entities.Recommendation.list("-created_date", 50).catch(() => []),
      base44.entities.DealActivation.list("-created_date", 50).catch(() => []),
    ]);
    setResults(r); setRecs(rec); setActivations(act);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const unlock = async (result, vertical, savings) => {
    if (!savings || savings <= 0) return;
    setBusyId(`${result.id}_${vertical}`);
    try {
      // Resolve brand_id (prefer result.brand_id, fallback to user's most recent brand)
      let brandId = result.brand_id;
      if (!brandId) {
        const brands = await base44.entities.Brand.list("-created_date", 1).catch(() => []);
        brandId = brands[0]?.id;
      }
      if (!brandId) throw new Error("No brand linked. Complete onboarding first.");

      // Create DealActivation in 'awaiting_authorization'
      const activation = await base44.entities.DealActivation.create({
        brand_id: brandId,
        user_email: user?.email,
        vertical,
        deal_name: `${vertical.charAt(0).toUpperCase() + vertical.slice(1)} optimization`,
        estimated_savings_yearly: savings,
        potential_savings_yearly: savings,
        projected_savings_annual: savings,
        projected_savings_monthly: Math.round(savings / 12),
        node_share_percent: 25,
        billing_model: "monthly_success_fee",
        status: "awaiting_authorization",
        realization_mode: "simulated",
      });

      // Create matching Recommendation
      await base44.entities.Recommendation.create({
        brand_id: brandId,
        deal_activation_id: activation.id,
        vertical,
        type: "unlock_savings",
        title: `Recover ${vertical} savings`,
        description: `Estimated €${savings.toLocaleString()}/yr recoverable. Pending authorization to proceed.`,
        expected_benefit: `€${savings.toLocaleString()}/yr estimated`,
        action_required: "Sign authorization mandate",
        action_link: `/RecoveryTracker?activation=${activation.id}`,
        status: "awaiting_authorization",
        effort_level: "low",
        generated_at: new Date().toISOString(),
      });

      await load();
    } catch (e) {
      toast.error(e.message || "Failed to unlock savings");
    }
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <RouteProbe label="UnlockSavings" state={{ branch: "loading" }} />
        <Loader2 className="h-4 w-4 animate-spin" /> Loading opportunities…
      </div>
    );
  }

  const opportunities = [];
  results.slice(0, 5).forEach(r => {
    if ((r.payment_savings || 0) > 0) opportunities.push({ result: r, vertical: "payments", savings: r.payment_savings, confidence: r.confidence_level, verification: r.verification_status });
    if ((r.shipping_savings || 0) > 0) opportunities.push({ result: r, vertical: "shipping", savings: r.shipping_savings, confidence: r.confidence_level, verification: r.verification_status });
    if ((r.saas_savings || 0) > 0) opportunities.push({ result: r, vertical: "saas", savings: r.saas_savings, confidence: r.confidence_level, verification: r.verification_status });
  });

  const isUnlocked = (resultId, vertical) =>
    activations.some(a => a.vertical === vertical && (a.brand_id === results.find(r => r.id === resultId)?.brand_id));

  return (
    <div className="space-y-6 max-w-5xl">
      <RouteProbe label="UnlockSavings" state={{ branch: "main", opportunities: opportunities.length }} />
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border/60 bg-background/70 mb-3">
          <Zap className="h-3 w-3 text-cambra-cyan" />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Step 02 · Recover</span>
        </div>
        <h1 className="font-display text-3xl font-black tracking-[-0.03em] mb-2">Unlock Savings</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Convert estimated savings into a tracked recovery flow. Each unlock creates a deal activation in <strong>awaiting authorization</strong> — you'll sign a mandate before any change is made.
        </p>
      </div>

      {/* Trust banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-amber-900/80">
          <strong>Estimates, not guarantees.</strong> Savings shown are based on benchmarks and your manual input. We never guarantee outcomes — verified savings will be tracked separately in the Recovery Tracker once mandates are signed and providers report back.
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
          <p className="text-sm text-muted-foreground mb-3">No analyzer results yet.</p>
          <Link to="/Analyzer"><Button size="sm">Run an analysis</Button></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp, i) => {
            const unlocked = isUnlocked(opp.result.id, opp.vertical);
            return (
              <div key={i} className="rounded-xl border border-border/60 bg-card p-5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{opp.vertical}</span>
                    {opp.verification === "pending_verification" && (
                      <span className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700">Pending verification</span>
                    )}
                    {opp.confidence && (
                      <span className="text-[10px] font-mono text-muted-foreground">conf: {opp.confidence}</span>
                    )}
                  </div>
                  <h3 className="font-bold text-base">Recover €{Math.round(opp.savings).toLocaleString()}/yr</h3>
                  <p className="text-xs text-muted-foreground mt-1">From analysis · {new Date(opp.result.created_date).toLocaleDateString()}</p>
                </div>
                {unlocked ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> Unlocked
                  </span>
                ) : (
                  <Button
                    onClick={() => unlock(opp.result, opp.vertical, opp.savings)}
                    disabled={busyId === `${opp.result.id}_${opp.vertical}`}
                    size="sm"
                    className="gap-1.5"
                  >
                    {busyId === `${opp.result.id}_${opp.vertical}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    Unlock
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {recs.filter(r => r.type === "unlock_savings").length > 0 && (
        <div className="pt-6 border-t border-border/40">
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2"><FileSignature className="h-4 w-4" /> Awaiting authorization</h2>
          <div className="space-y-2">
            {recs.filter(r => r.type === "unlock_savings" && r.status === "awaiting_authorization").map(r => (
              <Link key={r.id} to={r.action_link || "/RecoveryTracker"} className="block rounded-lg border border-border/60 bg-secondary/30 p-3 hover:bg-secondary/50 transition">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}