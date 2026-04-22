import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function RecommendationList(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('getRecommendationsForBrand', {});
    setItems(res.data?.items || []);
    setLoading(false);
  };

  useEffect(()=>{ load();
    try { const unsub = base44.entities.Recommendation.subscribe(()=>load()); return ()=>unsub?.(); } catch(e){}
  },[]);

  if (loading) return <div className="text-sm text-muted-foreground">Cargando recomendaciones…</div>;
  if (!items.length) return <div className="text-sm text-muted-foreground">Sin recomendaciones por ahora.</div>;

  return (
    <div className="space-y-2">
      {items.map((r)=> (
        <div key={r.id} className="rounded-lg border p-3 bg-card">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">{r.title}</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border">{r.type}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
          {r.expected_benefit && <p className="text-xs mt-1"><b>Beneficio:</b> {r.expected_benefit}</p>}
          <div className="flex items-center justify-between mt-2">
            <div className="text-[10px] text-muted-foreground">Score: {Math.round((r.score_json?.total||0)*100)/100}</div>
            {r.action_link && <a href={r.action_link} className="text-xs underline">{r.action_required || 'Abrir'}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}