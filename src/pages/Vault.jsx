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
import { CheckCircle2, Clock3, FileText, FolderLock, Search, UploadCloud } from 'lucide-react';
import DownloadAuditButton from '@/components/paymentsResults/DownloadAuditButton';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { useTranslation } from '@/lib/i18n.jsx';
import VaultDocumentDrawer from '@/components/vault/VaultDocumentDrawer';
import { DOC_CATEGORIES, DOC_STATUSES, categoryLabel, statusLabel } from '@/components/vault/vaultLabels';
import { toast } from 'sonner';
import SectionLabel from '@/components/shared/SectionLabel';

const EXTRACTABLE_CATEGORIES = new Set([
  'invoices',
  'statements',
  'provider_proposals',
  'contracts',
  'tax_docs',
  'pricing_docs',
]);
const DOCUMENT_FILE_ACCEPT = [
  'pdf', 'csv', 'tsv', 'txt', 'md', 'markdown', 'json',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'numbers',
  'doc', 'docx', 'rtf', 'odt', 'pages', 'ppt', 'pptx', 'key',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp',
].map((extension) => `.${extension}`).join(',');

function statusTone(value) {
  if (['approved', 'verified'].includes(value)) return 'border-[#BDEBD7] bg-[#EAF9F2] text-[#147651]';
  if (['rejected', 'superseded'].includes(value)) return 'border-[#FFD5D8] bg-[#FFF0F1] text-[#B43B47]';
  return 'border-[#DDD8FF] bg-[#F2F0FF] text-[#5545D4]';
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Vault() {
  const { t, locale } = useTranslation();
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

  const pendingCount = items.filter((item) => !['approved', 'verified'].includes(item.review_status)).length;
  const verifiedCount = items.length - pendingCount;

  return (
    <div className="workspace-light-page pb-12">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[820px]">
          <SectionLabel>{t('vlt_eyebrow')}</SectionLabel>
          <h1 className="workspace-page-title mt-5">{t('vlt_title')}</h1>
          <p className="workspace-page-lead mt-4">{t('vlt_subtitle')}</p>
        </div>
        {latestAudit && (
          <DownloadAuditButton
            engineResult={latestAudit.engineResult}
            inputSnapshot={latestAudit.inputSnapshot}
            brandName={latestAudit.inputSnapshot?.provider_slug || ''}
          />
        )}
      </header>

      <section className="mt-9 grid gap-3 sm:grid-cols-3">
        <div className="cambra-paper-card flex min-h-24 items-center gap-4 p-5"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFEDFF] text-[#5545D4]"><FolderLock size={18} /></span><div><strong className="block text-[26px] leading-none text-[#11182D]">{items.length}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.14em] text-[#747D92]">{t('vlt_all_categories')}</span></div></div>
        <div className="cambra-paper-card flex min-h-24 items-center gap-4 p-5"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF9F2] text-[#147651]"><CheckCircle2 size={18} /></span><div><strong className="block text-[26px] leading-none text-[#11182D]">{verifiedCount}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.14em] text-[#747D92]">{statusLabel(t, 'approved')}</span></div></div>
        <div className="cambra-paper-card flex min-h-24 items-center gap-4 p-5"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2F0FF] text-[#5545D4]"><Clock3 size={18} /></span><div><strong className="block text-[26px] leading-none text-[#11182D]">{pendingCount}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.14em] text-[#747D92]">{statusLabel(t, 'pending')}</span></div></div>
      </section>

      <section className="cambra-paper-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B1530] text-white"><UploadCloud size={18} /></span>
          <div><p className="text-[14px] font-bold text-[#11182D]">{t('vlt_upload')}</p><p className="mt-1 text-[11px] text-[#727B91]">{t('vlt_subtitle')}</p></div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="h-11 w-full border-[#DDE1EB] bg-white text-[#28324A] sm:w-48"><SelectValue placeholder={t('vlt_category_ph')} /></SelectTrigger>
            <SelectContent>{DOC_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>))}</SelectContent>
          </Select>
          <input ref={fileRef} type="file" accept={DOCUMENT_FILE_ACCEPT} onChange={onUpload} className="hidden" />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-11 rounded-xl px-5 font-bold text-white hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--g-voltio)" }}
          >
            <UploadCloud size={14} /> {uploading ? t('vlt_uploading') : t('vlt_upload')}
          </Button>
        </div>
      </section>

      <div className="cambra-paper-card mt-6 flex flex-wrap items-center gap-2 p-4">
        <div className="relative min-w-[210px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#858DA0]" /><Input placeholder={t('vlt_search_ph')} value={q} onChange={e=>setQ(e.target.value)} className="h-11 border-[#DDE1EB] bg-white pl-9 text-[#1F2942] placeholder:text-[#9AA1B1]" /></div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11 w-44 border-[#DDE1EB] bg-white text-[#28324A]"><SelectValue placeholder={t('vlt_category_ph')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('vlt_all_categories')}</SelectItem>
            {DOC_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11 w-40 border-[#DDE1EB] bg-white text-[#28324A]"><SelectValue placeholder={t('vlt_status_ph')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('vlt_all_statuses')}</SelectItem>
            {DOC_STATUSES.map(s => (<SelectItem key={s} value={s}>{statusLabel(t, s)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onFilter} className="h-11 rounded-xl border-[#DDE1EB] bg-[#0B1530] px-5 font-bold text-white hover:bg-[#152341] hover:text-white">{t('vlt_filter')}</Button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-[#70798E]">{t('vlt_loading')}</div>
      ) : items.length === 0 ? (
        // The grid used to render blank here — an empty result was
        // indistinguishable from a page that had failed to load.
        <div className="cambra-paper-card mt-6 py-24 text-center text-sm text-[#70798E]">{t('vlt_empty')}</div>
      ) : (
        <div className="cambra-paper-card mt-6 overflow-hidden">
          {items.map(doc => (
            <article key={doc.id} className={`group grid cursor-pointer gap-4 border-b border-[#E7E9EF] p-5 last:border-b-0 hover:bg-[#FAFAFD] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${selected?.id===doc.id ? 'bg-[#F6F4FF]' : ''}`} onClick={()=>setSelected(doc)}>
              <div className="flex min-w-0 items-center gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#DDD9FF] bg-[#F2F0FF] text-[#5545D4]"><FileText size={18} /></span>
                <div className="min-w-0"><h2 className="truncate text-[14px] font-bold text-[#11182D]">{doc.title || doc.file_name}</h2><p className="mt-1 truncate text-[11px] text-[#788096]">{categoryLabel(t, doc.category)}{doc.created_date ? ` · ${new Date(doc.created_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{formatFileSize(doc.file_size) ? ` · ${formatFileSize(doc.file_size)}` : ''}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border text-[10px] ${statusTone(doc.review_status)}`}>{statusLabel(t, doc.review_status)}</Badge>
                {Array.isArray(doc.tags) && doc.tags.slice(0,2).map(tag => <Badge key={tag} variant="outline" className="border-[#E1E4EB] bg-white text-[9px] text-[#687189]">#{tag}</Badge>)}
              </div>
              <a onClick={(event) => event.stopPropagation()} className="text-[11px] font-bold text-[#4D3DF1] underline decoration-[#C8C2FF] underline-offset-4" href={doc.file_url} target="_blank" rel="noopener noreferrer">{t('vlt_open')}</a>
            </article>
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
