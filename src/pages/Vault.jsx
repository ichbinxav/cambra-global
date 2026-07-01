import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHero from '@/components/shared/PageHero';
import { FolderLock } from 'lucide-react';

const CATEGORIES = [
  'invoices','statements','provider_proposals','contracts','signed_mandates','tax_docs','screenshots','benchmark_evidence','migration_docs','pricing_docs','internal_files'
];
const STATUSES = ['pending','approved','rejected','superseded'];

export default function Vault() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState('internal_files');

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
      await base44.functions.invoke('createDocument', { file_url, file_name: f.name, file_size: f.size, category: newCat, visibility: 'brand_and_admin' });
      await load();
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
        eyebrow="Documents · Organized"
        title="Document Vault."
        subtitle="Upload, organize, and link your business documents."
        icon={FolderLock}
        actions={
          <div className="flex items-center gap-2">
            <Select value={newCat} onValueChange={setNewCat}>
              <SelectTrigger className="w-44 bg-white/10 border-white/20 text-white"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
            </Select>
            <input ref={fileRef} type="file" onChange={onUpload} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-10 rounded-full px-5 bg-white text-[#06080F] hover:bg-white/90 font-bold">{uploading ? 'Uploading…' : 'Upload file'}</Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Buscar…" value={q} onChange={e=>setQ(e.target.value)} className="w-52" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onFilter}>Filtrar</Button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(items||[]).map(doc => (
            <div key={doc.id} className={`rounded-xl border p-4 bg-card hover:shadow-sm cursor-pointer ${selected?.id===doc.id? 'ring-1 ring-foreground' : ''}`} onClick={()=>setSelected(doc)}>
              <div className="flex items-center justify-between">
                <div className="font-semibold truncate max-w-[70%]">{doc.title || doc.file_name}</div>
                <Badge variant="outline" className="text-[10px]">{doc.category}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">{doc.file_name}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="bg-secondary text-secondary-foreground text-[10px]">{doc.review_status}</Badge>
                <Badge variant="outline" className="text-[10px]">{doc.visibility}</Badge>
                {Array.isArray(doc.tags) && doc.tags.slice(0,3).map(t => <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>)}
              </div>
              <div className="mt-3 text-xs"><a className="text-blue-600 underline" href={doc.file_url} target="_blank" rel="noreferrer">Abrir</a></div>
              {doc.links && doc.links.length>0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">Vínculos: {doc.links.map(l=>`${l.target_type}:${l.target_id}`).join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setSelected(null)} />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-card border-l p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Editar documento</h2>
              <Button variant="ghost" onClick={()=>setSelected(null)}>Cerrar</Button>
            </div>

            <div className="space-y-3">
              <label className="text-xs text-muted-foreground">Título</label>
              <Input defaultValue={selected.title || ''} onBlur={(e)=>saveMeta(selected, { title: e.target.value })} />

              <label className="text-xs text-muted-foreground">Etiquetas (separadas por coma)</label>
              <Input defaultValue={(selected.tags||[]).join(', ')} onBlur={(e)=>saveMeta(selected, { tags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} />

              <label className="text-xs text-muted-foreground">Notas</label>
              <Input defaultValue={selected.notes || ''} onBlur={(e)=>saveMeta(selected, { notes: e.target.value })} />

              <div className="flex items-center justify-between">
                <a className="text-blue-600 underline text-sm" href={selected.file_url} target="_blank" rel="noreferrer">Abrir archivo</a>
                <span className="text-[11px] text-muted-foreground">v{selected.version || 1}</span>
              </div>

              {/* Links */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Vínculos</h3>
                <LinkEditor doc={selected} onAdd={addLink} onRemove={removeLink} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkEditor({ doc, onAdd, onRemove }){
  const [type, setType] = useState('brand');
  const [id, setId] = useState('');
  const [primary, setPrimary] = useState(false);

  const submit = () => {
    onAdd(doc, { target_type: type, target_id: id, is_primary: primary });
    setId('');
    setPrimary(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {['brand','deal_activation','provider','mandate','monthly_savings_report','invoice','contract','statement_import','verification_event','baseline','savings_evidence','payment_event'].map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="ID de destino" value={id} onChange={e=>setId(e.target.value)} className="flex-1 min-w-[140px]" />
        <Button onClick={submit} disabled={!id}>Añadir</Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={primary}
          onChange={(e) => setPrimary(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-foreground cursor-pointer"
        />
        <span>Mark as primary link for this target</span>
      </label>
      <div className="text-xs text-muted-foreground">Actuales:</div>
      <ul className="space-y-1">
        {(doc.links||[]).map(l => (
          <li key={l.id} className="flex items-center justify-between border rounded-md px-2 py-1 text-xs">
            <span>{l.target_type} · {l.target_id} {l.is_primary ? '· primary' : ''}</span>
            <Button size="sm" variant="ghost" onClick={()=>onRemove(l.id)}>Quitar</Button>
          </li>
        ))}
        {(doc.links||[]).length===0 && <li className="text-xs text-muted-foreground">Sin vínculos</li>}
      </ul>
    </div>
  );
}