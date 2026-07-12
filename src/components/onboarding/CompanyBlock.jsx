import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import CountrySelect from '@/components/inputs/CountrySelect';
import CategorySelect from '@/components/inputs/CategorySelect';
import { Building2, Mail, Globe, Instagram, Linkedin, Twitter, Youtube, Music2, CheckCircle2, ArrowRight } from 'lucide-react';

export default function CompanyBlock({ onCreated, autoRedirect = true } = {}){
  const [brand, setBrand] = useState(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(()=>{ (async()=>{
    // A2 migration — resolve brand by contact_email (single source of truth).
    // NOTE: for BRAND-NEW users with zero brands yet, we still pre-fill the
    // form's contact_email from the auth user — that's what the create path
    // needs, and it's also what the helper will look up on the next load.
    const { user: me, brand: b } = await getMyActiveBrand();
    setBrand(b || {
      name: '', website: '', country: '', category: '', size: '',
      contact_email: me?.email || '', bio: '', instagram_url: '', linkedin_url: '', twitter_url: '', tiktok_url: '', youtube_url: '', accept_terms: false,
    });
  })(); },[]);

  const saveOrCreate = async () => {
    if (!brand?.name) {
      toast({ title: 'Brand name required', description: 'Please enter your brand name to continue.', variant: 'destructive' });
      return;
    }
    if (!brand?.id && !brand?.accept_terms) {
      toast({ title: 'Accept terms', description: 'You must accept the terms to create your brand profile.', variant: 'destructive' });
      return;
    }
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
      const isNew = !brand?.id;
      const saved = isNew
        ? await base44.entities.Brand.create(payload)
        : await base44.entities.Brand.update(brand.id, payload);
      setBrand(saved);
      toast({
        title: isNew ? 'Brand profile created' : 'Profile saved',
        description: isNew ? 'Next: run the Analyzer to surface your savings.' : 'Your changes have been saved.',
      });
      if (onCreated) onCreated(saved);
      // Auto-redirect to Analyzer on first creation — keeps the flow continuous
      if (isNew && autoRedirect) {
        setTimeout(() => navigate('/Analyzer'), 600);
      }
    } catch (err) {
      toast({ title: 'Could not save', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!brand) return <div className="py-10 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Brand identity */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="p-5 rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm space-y-4 hover:shadow-sm transition-shadow"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold">Brand identity</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input id="brand-name" className="pl-9" placeholder="Brand name" value={brand.name||''} onChange={e=>setBrand({...brand, name: e.target.value})} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input id="brand-email" className="pl-9" type="email" placeholder="email@brand.com" value={brand.contact_email||''} onChange={e=>setBrand({...brand, contact_email: e.target.value})} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-website">Website</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input id="brand-website" className="pl-9" placeholder="https://..." value={brand.website||''} onChange={e=>setBrand({...brand, website: e.target.value})} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-country">Country</Label>
            <CountrySelect value={brand.country || ''} onChange={(val)=> setBrand({...brand, country: val})} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="brand-category">Category</Label>
            <CategorySelect value={brand.category || ''} onChange={(val)=> setBrand({...brand, category: val})} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-bio">Bio / Description</Label>
          <Textarea id="brand-bio" className="min-h-[110px]" placeholder="Tell us about your brand, mission, product..." value={brand.bio||''} onChange={e=>setBrand({...brand, bio: e.target.value})} />
        </div>
      </motion.div>

      {/* Social media */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="p-5 rounded-2xl border border-border/50 bg-secondary/10 space-y-3 hover:bg-secondary/20 transition-colors"
      >
        <p className="text-xs font-semibold text-muted-foreground">Social links (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cambra-plum" />
            <Input className="pl-9" placeholder="Instagram URL" value={brand.instagram_url||''} onChange={e=>setBrand({...brand, instagram_url: e.target.value})} />
          </div>
          <div className="relative">
            <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cambra-lilac" />
            <Input className="pl-9" placeholder="LinkedIn URL" value={brand.linkedin_url||''} onChange={e=>setBrand({...brand, linkedin_url: e.target.value})} />
          </div>
          <div className="relative">
            <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cambra-mint" />
            <Input className="pl-9" placeholder="Twitter/X URL" value={brand.twitter_url||''} onChange={e=>setBrand({...brand, twitter_url: e.target.value})} />
          </div>
          <div className="relative">
            <Music2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input className="pl-9" placeholder="TikTok URL" value={brand.tiktok_url||''} onChange={e=>setBrand({...brand, tiktok_url: e.target.value})} />
          </div>
          <div className="relative sm:col-span-2">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            <Input className="pl-9" placeholder="YouTube URL" value={brand.youtube_url||''} onChange={e=>setBrand({...brand, youtube_url: e.target.value})} />
          </div>
        </div>
      </motion.div>

      {/* Terms + actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <Checkbox id="accept" checked={!!brand.accept_terms} onCheckedChange={(v)=>setBrand({...brand, accept_terms: !!v})} />
          <Label htmlFor="accept" className="text-sm">I accept the <a href="/Terms" target="_blank" className="underline">terms and conditions</a></Label>
        </div>
        <div className="flex gap-2 items-center">
          <Button onClick={saveOrCreate} disabled={saving} className="gap-2 h-10 rounded-full px-5">
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                Saving…
              </>
            ) : brand?.id ? (
              <><CheckCircle2 className="w-4 h-4" /> Save changes</>
            ) : (
              <>Create &amp; continue <ArrowRight className="w-4 h-4" /></>
            )}
          </Button>
          {brand?.id && (
            <Button
              variant="outline"
              onClick={() => navigate('/Analyzer')}
              className="h-10 rounded-full px-5 gap-2"
            >
              Run Analyzer <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}