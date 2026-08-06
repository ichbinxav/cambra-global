// Invoices — Checkpoint H (2026-08-06).
//
// LANGUAGE FIX. Two defects beyond the English-only labels:
//   • The status cell printed the RAW stored enum, so a merchant read
//     "partially_paid" and "void".
//   • Dates used `toLocaleDateString()` with no argument — that is the BROWSER's
//     locale, not the app language. A French merchant on an English-configured
//     laptop got English dates inside an otherwise French page, and an invalid
//     date would have rendered "Invalid Date".
//
// UNCHANGED: the server-side tenant-scoped read (getMyBillingRecords). No
// brand_id travels from the browser and the response stays a projection.

import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHero from '@/components/shared/PageHero';
import { Receipt } from 'lucide-react';
import { useTranslation } from '@/lib/i18n.jsx';
import { formatNumericDate } from '@/lib/dateFormats';
import { invoiceStatusLabel } from '@/components/invoices/invoiceLabels';

export default function Invoices() {
  const { t, lang } = useTranslation();
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

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('inv_loading')}</div>;

  // An absent date shows an em dash; formatNumericDate returns "" for an
  // invalid one, so a broken value falls into the same neutral display.
  const date = (value) => formatNumericDate(value, lang) || '—';

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow={t('inv_eyebrow')}
        title={t('inv_title')}
        subtitle={t('inv_subtitle')}
        icon={Receipt}
      />
      <div className="cambra-card overflow-auto">
        <table className="min-w-[700px] w-full text-sm relative text-white">
          <thead className="bg-white/[0.04]">
            <tr className="text-white/60">
              <th className="text-left p-3 font-semibold">{t('inv_col_invoice')}</th>
              <th className="text-left p-3 font-semibold">{t('inv_col_issued')}</th>
              <th className="text-left p-3 font-semibold">{t('inv_col_due')}</th>
              <th className="text-left p-3 font-semibold">{t('inv_col_total')}</th>
              <th className="text-left p-3 font-semibold">{t('inv_col_status')}</th>
              <th className="text-left p-3 font-semibold">{t('inv_col_link')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {items.map(inv => (
              <tr key={inv.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="p-3">{inv.invoice_number || inv.id}</td>
                <td className="p-3 text-white/70">{date(inv.issued_at)}</td>
                <td className="p-3 text-white/70">{date(inv.due_at)}</td>
                <td className="p-3 font-semibold">€{(inv.total_amount ?? 0).toLocaleString()}</td>
                <td className="p-3 text-white/70">{invoiceStatusLabel(t, inv.status)}</td>
                <td className="p-3">
                  {inv.hosted_invoice_url
                    ? <a className="text-cambra-cyan underline" href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">{t('inv_pay')}</a>
                    : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-white/50">{t('inv_empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}