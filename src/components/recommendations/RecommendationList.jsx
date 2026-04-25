import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function RecommendationList(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('getRecommendationsForBrand', {});
    setItems(res.data?.items || []);
    setLoading(false);
  };

  useEffect(()=>{ load();
    try { const unsub = base44.entities.Recommendation.subscribe(()=>load()); return ()=>unsub?.(); } catch(e){}
  },[]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading recommendations…</div>;
  if (!items.length) return <div className="text-sm text-muted-foreground">No recommendations yet.</div>;

  const priorityLabel = (t) => t>=75? 'High' : t>=50? 'Medium' : 'Low';
  const priorityColors = (p) => p==='High' ? 'bg-cambra-plum-soft border-cambra-plum text-cambra-plum' : p==='Medium' ? 'bg-cambra-lilac-soft border-cambra-lilac text-cambra-lilac' : 'bg-cambra-mint-soft border-cambra-mint text-cambra-mint';
  const formatCurrency = (n) => { try { return `€${Math.round(n).toLocaleString()}`; } catch { return `€${n}`; } };
  const computeImpact = (r) => {
    const s = r?.score_json || {};
    const euros = [s.impact_yearly_eur, s.impact_eur, s.annual_savings, s.savings_eur].find(v => typeof v === 'number');
    if (typeof euros === 'number') return euros;
    if (typeof s.points === 'number') return s.points;
    if (typeof s.total === 'number') return s.total;
    return 0;
  };

  const typeLabel = (t) => ({
    vertical_priority: 'Vertical priority',
    deal_suggestion: 'Deal suggestion',
    missing_data: 'Missing data',
    next_action: 'Next action',
    opportunity_ranking: 'Opportunity ranking',
    general: 'General',
  }[t] || t);

  const effortLabel = (e) => ({ low: 'Low', medium: 'Medium', high: 'High' }[e] || e);

  const byImpact = items.slice().sort((a,b) => computeImpact(b) - computeImpact(a));

  return (
    <div className="space-y-3">
      {byImpact.map((r)=> {
        const total = typeof r?.score_json?.total === 'number' ? r.score_json.total : 0;
        const prio = priorityLabel(total);
        const s = r?.score_json || {};
        const euros = [s.impact_yearly_eur, s.impact_eur, s.annual_savings, s.savings_eur].find(v => typeof v === 'number');
        const impactText = typeof euros === 'number' ? `${formatCurrency(euros)}/yr` : (r.expected_benefit || `${prio} impact`);
        const isOpen = expanded === r.id;

        return (
          <div key={r.id} className="rounded-xl border border-border/50 bg-card p-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm truncate max-w-[80%]">{r.title}</span>
                  <Badge variant="outline" className="text-[10px]">{typeLabel(r.type)}</Badge>
                  {r.effort_level && <Badge variant="outline" className="text-[10px]">{effortLabel(r.effort_level)}</Badge>}
                  {typeof total === 'number' && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priorityColors(prio)}`}>{prio}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
              </div>

              <div className="shrink-0 sm:min-w-[9rem] text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Estimated impact</p>
                <p className="text-lg font-black tabular-nums">{impactText}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="h-8 text-xs rounded-full px-3 gap-1.5"
              >
                {isOpen ? (<><ChevronUp className="h-3.5 w-3.5" /> Hide</>) : (<><ChevronDown className="h-3.5 w-3.5" /> Details</>)}
              </Button>
              <div className="flex items-center gap-2">
                {r.action_link && (
                  <a href={r.action_link} className="text-[11px] underline">{r.action_required || 'Open'}</a>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={async()=>{ await base44.functions.invoke('dismissRecommendation', { id: r.id }); load(); }}
                >
                  Dismiss
                </Button>
              </div>
            </div>

            {isOpen && (
              <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
                {(Array.isArray(r.reasons) && r.reasons.length>0) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Why</p>
                    <ul className="text-[12px] list-disc ml-4 text-foreground/80">
                      {r.reasons.slice(0,4).map((rs, i) => <li key={i}>{rs}</li>)}
                    </ul>
                  </div>
                )}
                {r.action_required && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Next step</p>
                    <p className="text-[12px] text-foreground/80">{r.action_required}</p>
                  </div>
                )}
                {(Array.isArray(r.missing_data) && r.missing_data.length>0) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Missing data</p>
                    <div className="flex flex-wrap gap-1">
                      {r.missing_data.slice(0,6).map((m,i)=> <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}