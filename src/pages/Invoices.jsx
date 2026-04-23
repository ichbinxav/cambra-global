import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function Invoices() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { setItems([]); setLoading(false); return; }
      const me = await base44.auth.me();
      const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
      const brand = brands?.[0];
      const invs = brand ? await base44.entities.Invoice.filter({ brand_id: brand.id }, '-issued_at', 200) : [];
      setItems(invs || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">My Invoices</h1>
      <div className="rounded-lg border overflow-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-secondary/40">
            <tr>
              <th className="text-left p-2">Invoice</th>
              <th className="text-left p-2">Issued</th>
              <th className="text-left p-2">Due</th>
              <th className="text-left p-2">Total</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(inv => (
              <tr key={inv.id}>
                <td className="p-2">{inv.invoice_number || inv.id}</td>
                <td className="p-2">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</td>
                <td className="p-2">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : '—'}</td>
                <td className="p-2">€{(inv.total_amount ?? 0).toLocaleString()}</td>
                <td className="p-2">{inv.status}</td>
                <td className="p-2">{inv.hosted_invoice_url ? <a className="text-blue-600 underline" href={inv.hosted_invoice_url} target="_blank">Pay</a> : '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No invoices yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}