import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function AdminRecommendations(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');

  const load = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    if (me?.role !== 'admin') { setItems([]); setLoading(false); return; }
    const res = await base44.functions.invoke('getAdminRecommendationQueue', {});
    let data = res.data?.items || [];
    if (type !== 'all') data = data.filter(r => r.type === type);
    if (q) data = data.filter(r => (r.title||'').toLowerCase().includes(q.toLowerCase()) || (r.description||'').toLowerCase().includes(q.toLowerCase()));
    setItems(data);
    setLoading(false);
  };

  useEffect(()=>{ load(); }, [q, type]);

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="min-w-0 max-w-full border rounded-md px-2 py-1 text-sm" placeholder="Buscar" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="min-w-0 max-w-full border rounded-md px-2 py-1 text-sm" value={type} onChange={e=>setType(e.target.value)}>
          {['all','vertical_priority','deal_suggestion','missing_data','next_action','opportunity_ranking'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="border rounded-md px-2 py-1 text-sm" onClick={load}>Refrescar</button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="w-full max-w-full overflow-x-auto rounded-lg border">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-secondary/40">
              <tr>
                <th className="text-left p-2">Brand</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Título</th>
                <th className="text-left p-2">Prioridad</th>
                <th className="text-left p-2">Esfuerzo</th>
                <th className="text-left p-2">MD</th>
                <th className="text-left p-2">Beneficio</th>
                <th className="text-left p-2">Acción</th>
                <th className="text-left p-2">Score</th>
                <th className="text-left p-2">Generada</th>
                <th className="text-left p-2">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(r => (
                <tr key={r.id}>
                  <td className="p-2">{r.brand_id}</td>
                  <td className="p-2"><span className="text-[10px] px-2 py-0.5 rounded-full border">{r.type}</span></td>
                  <td className="p-2 font-medium">{r.title}</td>
                  <td className="p-2">{typeof r.score_json?.total==='number' ? (r.score_json.total>=75?'Alta':r.score_json.total>=50?'Media':'Baja') : '—'}</td>
                  <td className="p-2">{r.effort_level || '—'}</td>
                  <td className="p-2">{Array.isArray(r.missing_data)? r.missing_data.length : 0}</td>
                  <td className="p-2">{r.expected_benefit || '—'}</td>
                  <td className="p-2">{r.action_required || '—'}</td>
                  <td className="p-2">{Math.round((r.score_json?.total||0)*100)/100}</td>
                  <td className="p-2">{r.generated_at ? new Date(r.generated_at).toLocaleString() : '—'}</td>
                  <td className="p-2">
                    <button className="text-xs underline" onClick={async()=>{ await base44.functions.invoke('regenerateRecommendationsForBrand', { brandId: r.brand_id }); load(); }}>Recalcular</button>
                  </td>
                </tr>
              ))}
              {items.length===0 && (
                <tr><td colSpan={11} className="p-6 text-center text-sm text-muted-foreground">Sin recomendaciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
