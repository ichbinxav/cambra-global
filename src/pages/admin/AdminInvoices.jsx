import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['all','draft','issued','sent','due','partially_paid','paid','failed','overdue','void','disputed','refunded'];

export default function AdminInvoices() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const list = status==='all' ? await base44.entities.Invoice.list('-issued_at', 500) : await base44.entities.Invoice.filter({ status }, '-issued_at', 500);
    const data = (list || []).filter(i => !q || (i.invoice_number||'').toLowerCase().includes(q.toLowerCase()) || (i.brand_id||'').includes(q) || (i.provider_id||'').includes(q));
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [status, q]);

  const createLink = async (id) => {
    try {
      const res = await base44.functions.invoke('createPaymentLink', { invoice_id: id });
      if (res.data?.url) window.open(res.data.url, '_blank');
      await load();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const markPaid = async (id) => {
    const v = prompt('Amount received (e.g. 120.50)');
    if (!v) return;
    const amount = Number(v);
    if (isNaN(amount)) return alert('Invalid amount');
    await base44.functions.invoke('recordPayment', { invoice_id: id, amount, method: 'manual' });
    await load();
  };

  const reconcile = async (id) => {
    const target = prompt('Target status (void|disputed|refunded|failed)');
    if (!target) return;
    await base44.functions.invoke('reconcileInvoice', { invoice_id: id, target_status: target, reason: 'manual_admin' });
    await load();
  };

  const generatePdf = async (id) => {
    try {
      const res = await base44.functions.invoke('generateInvoicePdf', { invoice_id: id });
      if (res.data?.url) window.open(res.data.url, '_blank');
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="Search #, brand_id o provider_id" value={q} onChange={e=>setQ(e.target.value)} className="w-64" />
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-auto rounded-lg border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-secondary/40">
              <tr>
                <th className="text-left p-2">Invoice</th>
                <th className="text-left p-2">Brand</th>
                <th className="text-left p-2">Issued</th>
                <th className="text-left p-2">Due</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Paid</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(inv => (
                <tr key={inv.id} className="hover:bg-secondary/30">
                  <td className="p-2 font-medium">{inv.invoice_number || inv.id}</td>
                  <td className="p-2">{inv.brand_id || '—'}</td>
                  <td className="p-2">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</td>
                  <td className="p-2">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : '—'}</td>
                  <td className="p-2">€{(inv.total_amount ?? 0).toLocaleString()}</td>
                  <td className="p-2">€{(inv.amount_paid ?? 0).toLocaleString()}</td>
                  <td className="p-2"><span className="px-2 py-0.5 rounded-full border text-xs">{inv.status}</span></td>
                  <td className="p-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={()=>generatePdf(inv.id)}>PDF</Button>
                    <Button size="sm" variant="outline" onClick={()=>createLink(inv.id)}>Payment link</Button>
                    <Button size="sm" onClick={()=>markPaid(inv.id)}>Record payment</Button>
                    <Button size="sm" variant="ghost" onClick={()=>reconcile(inv.id)}>Reconcile</Button>
                    {inv.hosted_invoice_url && <a className="text-blue-600 text-xs underline" href={inv.hosted_invoice_url} target="_blank">Open link</a>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">No invoices</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}