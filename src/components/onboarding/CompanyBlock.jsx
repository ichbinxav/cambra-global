import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function CompanyBlock(){
  const [brand, setBrand] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ (async()=>{
    const me = await base44.auth.me();
    const [b] = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    setBrand(b || {
      name: '', website: '', country: '', category: '', size: '',
      contact_email: '', bio: '', instagram_url: '', linkedin_url: '', twitter_url: '', tiktok_url: '', youtube_url: '', accept_terms: false,
    });
  })(); },[]);

  const saveOrCreate = async () => {
    if (!brand?.name) { alert('Por favor, indica el nombre de tu marca'); return; }
    if (!brand?.id && !brand?.accept_terms) { alert('Debes aceptar los términos para crear el perfil'); return; }
    setSaving(true);
    const payload = {
      name: brand.name,
      website: brand.website,
      country: brand.country,
      category: brand.category,
      size: brand.size,
      contact_email: brand.contact_email,
      bio: brand.bio,
      instagram_url: brand.instagram_url,
      linkedin_url: brand.linkedin_url,
      twitter_url: brand.twitter_url,
      tiktok_url: brand.tiktok_url,
      youtube_url: brand.youtube_url,
      accept_terms: !!brand.accept_terms,
    };
    try {
      if (brand?.id) {
        const updated = await base44.entities.Brand.update(brand.id, payload);
        setBrand(updated);
        alert('Guardado');
      } else {
        const created = await base44.entities.Brand.create(payload);
        setBrand(created);
        alert('Perfil creado');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!brand) return <div className="py-10 text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Nombre</Label>
          <Input id="brand-name" placeholder="Nombre de la marca" value={brand.name||''} onChange={e=>setBrand({...brand, name: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-email">Email</Label>
          <Input id="brand-email" type="email" placeholder="correo@brand.com" value={brand.contact_email||''} onChange={e=>setBrand({...brand, contact_email: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-website">Website</Label>
          <Input id="brand-website" placeholder="https://..." value={brand.website||''} onChange={e=>setBrand({...brand, website: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-country">País</Label>
          <Input id="brand-country" placeholder="España" value={brand.country||''} onChange={e=>setBrand({...brand, country: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-category">Categoría</Label>
          <Input id="brand-category" placeholder="fashion / beauty / ..." value={brand.category||''} onChange={e=>setBrand({...brand, category: e.target.value})} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brand-bio">Biografía / Descripción</Label>
        <Textarea id="brand-bio" placeholder="Cuéntanos sobre la marca, misión, producto..." value={brand.bio||''} onChange={e=>setBrand({...brand, bio: e.target.value})} />
      </div>

      <div className="p-4 rounded-2xl border border-border/50 bg-secondary/10 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Redes sociales (opcionales)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Instagram URL" value={brand.instagram_url||''} onChange={e=>setBrand({...brand, instagram_url: e.target.value})} />
          <Input placeholder="LinkedIn URL" value={brand.linkedin_url||''} onChange={e=>setBrand({...brand, linkedin_url: e.target.value})} />
          <Input placeholder="Twitter/X URL" value={brand.twitter_url||''} onChange={e=>setBrand({...brand, twitter_url: e.target.value})} />
          <Input placeholder="TikTok URL" value={brand.tiktok_url||''} onChange={e=>setBrand({...brand, tiktok_url: e.target.value})} />
          <Input placeholder="YouTube URL" value={brand.youtube_url||''} onChange={e=>setBrand({...brand, youtube_url: e.target.value})} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="accept" checked={!!brand.accept_terms} onCheckedChange={(v)=>setBrand({...brand, accept_terms: !!v})} />
        <Label htmlFor="accept" className="text-sm">Acepto los <a href="/Terms" target="_blank" className="underline">términos y condiciones</a></Label>
      </div>

      <div className="flex gap-2">
        <Button onClick={saveOrCreate} disabled={saving}>{saving ? 'Guardando…' : (brand?.id ? 'Guardar' : 'Crear perfil')}</Button>
        <a href="/Analyzer" className="text-sm underline">Ir al Analyzer</a>
      </div>
    </div>
  );
}