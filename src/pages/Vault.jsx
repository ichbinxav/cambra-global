// Vault — Checkpoint H (2026-08-06).
//
// LANGUAGE FIX: this page shipped with a mixed-language interface — half English
// ("Upload file", "All categories", "Status"), half hardcoded Spanish ("Buscar…",
// "Filtrar", "Editar documento", "Añadir", "Sin vínculos"). An English or French
// merchant was shown Spanish no matter what they had chosen in the switcher. Every
// string now routes through t(), and the category / review-status enums are
// rendered through translated labels instead of printing the raw stored values
// ("benchmark_evidence", "superseded").
//
// UNCHANGED ON PURPOSE: the stored values, every backend payload (listDocuments,
// createDocument, updateDocumentMeta, linkDocument, unlinkDocument) and the filter
// semantics. This is a presentation fix; nothing about what is saved moved.
//
// The drawer and the link editor moved to src/components/vault/ — they were a
// second and third component living inside this page file.

import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHero from '@/components/shared/PageHero';
import { FolderLock } from 'lucide-react';
import DownloadAuditButton from '@/components/paymentsResults/DownloadAuditButton';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { useTranslation } from '@/lib/i18n.jsx';
import VaultDocumentDrawer from '@/components/vault/VaultDocumentDrawer';
import { DOC_CATEGORIES, DOC_STATUSES, categoryLabel, statusLabel } from '@/components/vault/vaultLabels';
import { toast } from 'sonner';

const EXTRACTABLE_CATEGORIES = new Set([
  'invoices',
  'statements',
  'provider_proposals',
  'contracts',
  'tax_docs',
  'pricing_docs',
]);

export default function Vault() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState('internal_files');
  // Latest analysis with an engine_result → powers the "Download audit (PDF)"
  // button in the hero. Same source the report uses; null hides the button.
  const [latestAudit, setLatestAudit] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { brand } = await getMyActiveBrand();
        if (!brand) return;
        const rows = await base44.entities.AnalyzerResult
          .filter({ brand_id: brand.id }, '-created_date', 20).catch(() => []);
        const withEngine = (rows || []).find(r => r?.details?.engine_result);
        if (withEngine) {
          setLatestAudit({
            engineResult: withEngine.details.engine_result,
            inputSnapshot: withEngine.details.input_snapshot || null,
          });
        }
      } catch { /* button just hides */ }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('listDocuments', { q, category: category === 'all' ? undefined : category, review_status: status === 'all' ? undefined : status, include_links: true });
    setItems(res.data?.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onFilter = async () => { await load(); };

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      const createdResponse = await base44.functions.invoke('createDocument', { file_url, file_name: f.name, file_size: f.size, category: newCat, visibility: 'brand_and_admin' });
      const created = createdResponse?.data?.document || createdResponse?.document;

      if (EXTRACTABLE_CATEGORIES.has(newCat) && created?.owner_type === 'brand') {
        try {
          const extractionResponse = await base44.functions.invoke('processUploadedFile', { file_url, file_name: f.name });
          const extraction = extractionResponse?.data || extractionResponse;
          if (extraction?.statement_import_id && created?.id) {
            await base44.functions.invoke('linkDocument', {
              document_id: created.id,
              target_type: 'statement_import',
              target_id: extraction.statement_import_id,
              is_primary: true,
            }).catch(() => null);
          }
          if (extraction?.status === 'success') toast.success(t('vlt_upload_extracted'));
          else toast.warning(t('vlt_upload_review'));
        } catch {
          // The Vault write is already durable. Extraction failure must never
          // delete or hide the merchant's original document.
          toast.warning(t('vlt_upload_review'));
        }
      } else {
        toast.success(t('vlt_upload_saved'));
      }
      await load();
    } catch {
      toast.error(t('vlt_upload_failed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveMeta = async (doc, patch) => {
    await base44.functions.invoke('updateDocumentMeta', { document_id: doc.id, ...patch });
    await load();
  };

  const addLink = async (doc, target) => {
    if (!target?.target_type || !target?.target_id) return;
    await base44.functions.invoke('linkDocument', { document_id: doc.id, target_type: target.target_type, target_id: target.target_id, is_primary: !!target.is_primary });
    await load();
  };

  const removeLink = async (linkId) => {
    await base44.functions.invoke('unlinkDocument', { link_id: linkId });
    await load();
  };

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow={t('vlt_eyebrow')}
        title={t('vlt_title')}
        subtitle={t('vlt_subtitle')}
        icon={FolderLock}
        actions={
          <div className="flex items-center gap-2">
            {latestAudit && (
              <DownloadAuditButton
                engineResult={latestAudit.engineResult}
                inputSnapshot={latestAudit.inputSnapshot}
                brandName={latestAudit.inputSnapshot?.provider_slug || ''}
              />
            )}
            <Select value={newCat} onValueChange={setNewCat}>
              <SelectTrigger className="w-44 bg-white/10 border-white/20 text-white"><SelectValue placeholder={t('vlt_category_ph')} /></SelectTrigger>
              <SelectContent>{DOC_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>))}</SelectContent>
            </Select>
            <input ref={fileRef} type="file" onChange={onUpload} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-10 rounded-full px-5 bg-white text-[#06080F] hover:bg-white/90 font-bold">{uploading ? t('vlt_uploading') : t('vlt_upload')}</Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder={t('vlt_search_ph')} value={q} onChange={e=>setQ(e.target.value)} className="w-52 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 bg-white/[0.04] border-white/10 text-white"><SelectValue placeholder={t('vlt_category_ph')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('vlt_all_categories')}</SelectItem>
            {DOC_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 bg-white/[0.04] border-white/10 text-white"><SelectValue placeholder={t('vlt_status_ph')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('vlt_all_statuses')}</SelectItem>
            {DOC_STATUSES.map(s => (<SelectItem key={s} value={s}>{statusLabel(t, s)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onFilter} className="bg-white/[0.04] border-white/10 text-white hover:bg-white/10 hover:text-white">{t('vlt_filter')}</Button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-muted-foreground">{t('vlt_loading')}</div>
      ) : items.length === 0 ? (
        // The grid used to render blank here — an empty result was
        // indistinguishable from a page that had failed to load.
        <div className="py-24 text-center text-sm text-white/50">{t('vlt_empty')}</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(doc => (
            <div key={doc.id} className={`cambra-card p-4 cursor-pointer ${selected?.id===doc.id? 'ring-1 ring-cambra-cyan' : ''}`} onClick={()=>setSelected(doc)}>
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="font-semibold truncate max-w-[70%] text-white">{doc.title || doc.file_name}</div>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">{categoryLabel(t, doc.category)}</Badge>
                </div>
                <div className="text-xs text-white/50 mt-1 truncate">{doc.file_name}</div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className="border border-white/10 bg-white/[0.06] text-white/75 text-[10px]">{statusLabel(t, doc.review_status)}</Badge>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">{doc.visibility}</Badge>
                  {Array.isArray(doc.tags) && doc.tags.slice(0,3).map(tag => <Badge key={tag} variant="outline" className="text-[10px] border-white/15 text-white/70">#{tag}</Badge>)}
                </div>
                <div className="mt-3 text-xs"><a className="text-cambra-cyan underline" href={doc.file_url} target="_blank" rel="noopener noreferrer">{t('vlt_open')}</a></div>
                {doc.links && doc.links.length>0 && (
                  <div className="mt-2 text-[11px] text-white/50">{t('vlt_links')}: {doc.links.map(l=>`${l.target_type}:${l.target_id}`).join(', ')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <VaultDocumentDrawer
        doc={selected}
        onClose={() => setSelected(null)}
        onSaveMeta={saveMeta}
        onAddLink={addLink}
        onRemoveLink={removeLink}
      />
    </div>
  );
}
