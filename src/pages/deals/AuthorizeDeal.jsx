import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import SignaturePad from '@/components/deals/SignaturePad';
import { useParams, useNavigate } from 'react-router-dom';

export default function AuthorizeDeal() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState(null);
  const [brand, setBrand] = useState(null);
  const [consents, setConsents] = useState({ negotiate: false, shareData: false, successFee: false, scopeAck: false });
  const [sig, setSig] = useState(null);
  const [form, setForm] = useState({ entity: '', name: '', role: '', email: '' });
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me();
      const deals = await base44.entities.DealActivation.filter({ id: dealId });
      setDeal(deals[0] || null);
      const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
      setBrand(brands[0] || null);
    })();
  }, [dealId]);

  const allChecked = Object.values(consents).every(Boolean);
  const canSubmit = allChecked && sig && form.entity && form.name && form.role && form.email;

  const dataUrlToBlob = (dataUrl) => {
    const [meta, b64] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/png';
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const submit = async () => {
    if (!canSubmit) return;
    let fileUri = '';
    if (sig) {
      const blob = dataUrlToBlob(sig);
      const res = await base44.integrations.Core.UploadPrivateFile({ file: blob });
      fileUri = res.file_uri;
    }
    const resp = await base44.functions.invoke('authorizeDeal', {
      dealActivationId: dealId,
      consents,
      signer: { entity: form.entity, name: form.name, role: form.role, email: form.email },
      signed_document_uri: fileUri
    });
    if (resp?.data?.error) { alert(resp.data.error); return; }
    navigate(`/deal/migration/${dealId}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-black">Authorization & Mandate</h1>
      <div className="rounded-xl border p-5 bg-card space-y-4 text-sm">
        <p className="text-muted-foreground/70">What THE NoDE will do:</p>
        <ul className="list-disc ml-5 space-y-1 text-muted-foreground/80">
          <li>Negotiate with providers</li>
          <li>Request pricing and share necessary data</li>
          <li>Configure accounts</li>
          <li>Execute optimization steps</li>
        </ul>
        <div className="grid gap-2 mt-2">
          {[
            { key: 'negotiate', label: 'Authorize negotiation with providers' },
            { key: 'shareData', label: 'Authorize sharing necessary operational data' },
            { key: 'successFee', label: 'Accept success-fee model (25%)' },
            { key: 'scopeAck', label: 'Acknowledge defined execution scope' },
          ].map(i => (
            <label key={i.key} className="flex items-center gap-2">
              <input type="checkbox" checked={consents[i.key]} onChange={e => setConsents({ ...consents, [i.key]: e.target.checked })} />
              <span>{i.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="rounded-xl border p-5 bg-card space-y-3">
        <p className="font-semibold">Signer details</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <input placeholder="Legal entity name" className="border rounded-md px-3 py-2" value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })} />
          <input placeholder="Signer name" className="border rounded-md px-3 py-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Signer role" className="border rounded-md px-3 py-2" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
          <input placeholder="Signer email" className="border rounded-md px-3 py-2" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Digital signature</p>
          <SignaturePad onChange={setSig} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!canSubmit}>Authorize & continue</Button>
      </div>
    </div>
  );
}