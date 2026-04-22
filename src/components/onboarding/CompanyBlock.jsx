import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function CompanyBlock(){
  const [brand, setBrand] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ (async()=>{
    const me = await base44.auth.me();
    const [b] = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    setBrand(b || {});
  })(); },[]);

  const save = async () => {
    if (!brand?.id) return;
    setSaving(true);
    await base44.entities.Brand.update(brand.id, { name: brand.name, website: brand.website, country: brand.country, category: brand.category, size: brand.size });
    setSaving(false);
    alert('Guardado');
  };

  if (!brand) return <div className="py-10 text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Nombre" value={brand.name||''} onChange={e=>setBrand({...brand, name: e.target.value})} />
        <Input placeholder="Website" value={brand.website||''} onChange={e=>setBrand({...brand, website: e.target.value})} />
        <Input placeholder="País" value={brand.country||''} onChange={e=>setBrand({...brand, country: e.target.value})} />
        <Input placeholder="Categoría" value={brand.category||''} onChange={e=>setBrand({...brand, category: e.target.value})} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Guardando…':'Guardar'}</Button>
        <a href="/Analyzer" className="text-sm underline">Ir al Analyzer</a>
      </div>
    </div>
  );
}