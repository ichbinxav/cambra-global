import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

  const priorityLabel = (t) => t>=75? 'Alta' : t>=50? 'Media' : 'Baja';

  return (
    <div className="space-y-2">
      {items.map((r)=> (
        <div key={r.id} className="rounded-lg border p-3 bg-card">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-sm truncate">{r.title}</div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
              {typeof r.score_json?.total === 'number' && (
                <Badge className="text-[10px]">{priorityLabel(r.score_json.total)} · {r.score_json.total}</Badge>
              )}
              {r.effort_level && <Badge variant="outline" className="text-[10px]">{r.effort_level}</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{r.description}</p>

          {(Array.isArray(r.reasons) && r.reasons.length>0) && (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground">Por qué:</p>
              <ul className="text-[11px] list-disc ml-4">
                {r.reasons.slice(0,2).map((rs, i) => <li key={i}>{rs}</li>)}
              </ul>
            </div>
          )}

          {(Array.isArray(r.missing_data) && r.missing_data.length>0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {r.missing_data.slice(0,4).map((m,i)=> <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>)}
            </div>
          )}

          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="text-[10px] text-muted-foreground">Score: {Math.round((r.score_json?.total||0)*100)/100}</div>
            <div className="flex items-center gap-2">
              {r.action_link && <a href={r.action_link} className="text-xs underline">{r.action_required || 'Abrir'}</a>}
              <Button variant="ghost" size="sm" onClick={async()=>{ await base44.functions.invoke('dismissRecommendation', { id: r.id }); load(); }}>Descartar</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}