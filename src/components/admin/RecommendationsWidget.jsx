import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function RecommendationsWidget(){
  const [items, setItems] = useState([]);

  const load = async () => {
    const me = await base44.auth.me();
    if (me?.role !== 'admin') return setItems([]);
    const res = await base44.functions.invoke('getAdminRecommendationQueue', {});
    setItems(res.data?.items || []);
  };

  useEffect(()=>{ load(); },[]);

  const top = (items||[]).slice(0,5);

  return (
    <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Top recomendaciones</h3>
        <span className="text-[10px] text-muted-foreground">{items.length} totales</span>
      </div>
      <ul className="space-y-1">
        {top.map(r=> (
          <li key={r.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1">
            <span className="truncate mr-2">{r.title}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border">{r.type}</span>
          </li>
        ))}
        {top.length===0 && <li className="text-xs text-muted-foreground">Sin recomendaciones</li>}
      </ul>
    </div>
  );
}