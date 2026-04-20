import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { toast } from 'sonner';

export default function AdminActivationDetail(){
  const [sp] = useSearchParams();
  const params = useParams();
  const id = params.id || sp.get('id');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Override modal state (must be before any early returns)
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState(null);
  const [overridePayload, setOverridePayload] = useState({});
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideReasonError, setOverrideReasonError] = useState(null);

  useEffect(()=>{ (async()=>{
    try {
      const res = await base44.functions.invoke('getActivationAdminDetail', { id });
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  })(); }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  const { activation, baselines, rules, mandates, tasks, reports, invoices, logs, progress } = data || {};

  const reload = async () => {
    const res = await base44.functions.invoke('getActivationAdminDetail', { id });
    setData(res.data);
  };

  const openOverride = (action, payload={}) => { setOverrideAction(action); setOverridePayload(payload); setOverrideOpen(true); };
  const submitOverride = async () => {
    if (!overrideReason.trim()) { setOverrideReasonError('Please provide a reason'); return; }
    const res = await base44.functions.invoke('adminOverrides', { action: overrideAction, reason: overrideReason, payload: overridePayload });
    if (res.data?.error) { toast.error(res.data.error); return; }
    setOverrideOpen(false); setOverrideReason('');
    setOverrideReasonError(null);
    await reload();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Activation {activation.id}</h1>
        <Link to="/admin">Back</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-xl border p-4 bg-card">
          <p className="text-xs text-muted-foreground">Core</p>
          <div className="text-sm mt-2 space-y-1">
            <div>Status: <b>{activation.status}</b></div>
            <div>Brand: <b>{activation.brand_id}</b></div>
            <div>Provider: <b>{activation.provider_id||'-'}</b></div>
            <div>Vertical: <b>{activation.vertical}</b></div>
            <div>Projected savings / yr: <b>€{(activation.projected_savings_annual ?? 0).toLocaleString()}</b></div>
            <div>Realized savings / yr: <b>{activation.realized_savings_yearly !== undefined ? `€${(activation.realized_savings_yearly||0).toLocaleString()}` : '—'}</b></div>
            <div>Monetized to date: <b>{reports && reports.length ? `€${reports.reduce((sum, r) => sum + (r.node_fee || 0), 0).toLocaleString()}` : '—'}</b></div>
            <div>Progress: <b>{progress}%</b></div>
          </div>
        </div>
        <div className="rounded-xl border p-4 bg-card">
          <p className="text-xs text-muted-foreground">Baseline</p>
          <div className="text-sm mt-2">{baselines?.[0] ? (
            <div>Type: {baselines[0].baseline_type} · Value: {baselines[0].baseline_value}</div>
          ) : 'Missing'}</div>
        </div>
        <div className="rounded-xl border p-4 bg-card">
          <p className="text-xs text-muted-foreground">Billing Rule</p>
          <div className="text-sm mt-2">{rules?.[0] ? (
            <div>{rules[0].billing_model} · Share {rules[0].node_share_percent}%</div>
          ) : 'Missing'}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-card">
        <p className="text-sm font-semibold">Mandate</p>
        <div className="text-sm mt-2">{mandates?.[0] ? (
          <div>Status: {mandates[0].status} · Signed by {mandates[0].signed_by_name} · {mandates[0].signed_at}</div>
        ) : 'No mandate'}</div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border p-4 bg-card">
          <p className="text-sm font-semibold mb-2">Migration tasks</p>
          <ul className="space-y-1 text-sm">
            {tasks.map(t=> (
              <li key={t.id} className="flex items-center justify-between border rounded-md px-2 py-1">
                <span>{t.step_name} · {t.status}</span>
                <span className="text-xs text-muted-foreground">{t.owner_type||'admin'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-4 bg-card">
          <p className="text-sm font-semibold mb-2">Reports & invoices</p>
          <div className="text-xs text-muted-foreground mb-2">Latest</div>
          <ul className="space-y-1 text-sm">
            {reports.map(r=> (
              <li key={r.id} className="flex items-center justify-between border rounded-md px-2 py-1">
                <span>{r.month} · Savings €{(r.savings||0).toLocaleString()} · Fee €{(r.node_fee||0).toLocaleString()} · {r.measurement_mode}</span>
                <button onClick={()=>openOverride('verify_report', { report_id: r.id })} className="text-xs underline">Verify</button>
              </li>
            ))}
          </ul>
          <div className="h-2"/>
          <ul className="space-y-1 text-sm">
            {invoices.map(i=> (
              <li key={i.id} className="flex items-center justify-between border rounded-md px-2 py-1">
                <span>{i.month} · €{Number(i.amount||0).toLocaleString()} · {i.status}</span>
                {i.status!=='void' && <button onClick={()=>openOverride('void_invoice', { invoice_id: i.id })} className="text-xs underline">Void</button>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-card">
        <p className="text-sm font-semibold mb-2">Operational logs</p>
        <ul className="space-y-1 text-xs">
          {logs.map(l=> <li key={l.id} className="border rounded-md px-2 py-1">{l.created_at} · {l.event_type} — {l.message}</li>)}
        </ul>
      </div>
      {/* Override modal */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/75 backdrop-blur" onClick={()=>setOverrideOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-bold">Admin override</p>
            <textarea value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} rows={4}
              className="w-full text-sm bg-background border border-border rounded-lg p-2" placeholder="Reason (required)" />
            {overrideReasonError && <p className="text-xs text-red-500 mt-1">{overrideReasonError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={()=>setOverrideOpen(false)} className="h-8 px-3 rounded-md border border-border text-xs">Cancel</button>
              <button onClick={submitOverride} className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-bold">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}