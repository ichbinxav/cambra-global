import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHero from '@/components/shared/PageHero';
import { Receipt } from 'lucide-react';

export default function Invoices() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { setItems([]); setLoading(false); return; }
      // v61 Checkpoint D — invoices are read SERVER-SIDE, with the tenant scope
      // resolved from the session. No brand_id travels from the browser, and
      // the response is a projection (no billing snapshot / tax evidence).
      const resp = await base44.functions.invoke('getMyBillingRecords', {}).catch(() => null);
      setItems(resp?.data?.invoices || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Billing · CAMBRA"
        title="My Invoices."
        subtitle="Track invoices and payment status across activations."
        icon={Receipt}
      />
      <div className="cambra-card overflow-auto">
        <table className="min-w-[700px] w-full text-sm relative text-white">
          <thead className="bg-white/[0.04]">
            <tr className="text-white/60">
              <th className="text-left p-3 font-semibold">Invoice</th>
              <th className="text-left p-3 font-semibold">Issued</th>
              <th className="text-left p-3 font-semibold">Due</th>
              <th className="text-left p-3 font-semibold">Total</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {items.map(inv => (
              <tr key={inv.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="p-3">{inv.invoice_number || inv.id}</td>
                <td className="p-3 text-white/70">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</td>
                <td className="p-3 text-white/70">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : '—'}</td>
                <td className="p-3 font-semibold">€{(inv.total_amount ?? 0).toLocaleString()}</td>
                <td className="p-3 text-white/70">{inv.status}</td>
                <td className="p-3">{inv.hosted_invoice_url ? <a className="text-cambra-cyan underline" href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">Pay</a> : '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-white/50">No invoices yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}