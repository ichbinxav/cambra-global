import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const copy=(lang)=>fs.readFileSync(`src/lib/locales/${lang}.js`,'utf8');

describe('human-first and SEO-first public copy seal',()=>{
  it('gives each supported language a native, customer-readable promise',()=>{
    expect(copy('en')).toContain('Stop losing margin');
    expect(copy('fr')).toContain('Arrêtez de perdre de la marge');
    expect(copy('es')).toContain('Deja de perder margen');
  });
  it('states the economic promise without guaranteeing savings',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      expect(source).toMatch(/confirmed|confirmées|confirma/);
      expect(source).not.toMatch(/guaranteed savings|économies garanties|ahorro garantizado/i);
    }
  });
  it('keeps technical governance language out of the main customer journey',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      const hero=source.slice(source.indexOf('hero_badge:'),source.indexOf('hero_image_alt:'));
      expect(hero).not.toMatch(/infrastructure intelligence|decision gouvernée|decisión gobernada|evidence-aware/i);
    }
  });
  it('aligns static and runtime homepage search metadata',()=>{
    const seo=fs.readFileSync('src/lib/seoConfig.js','utf8');
    const html=fs.readFileSync('index.html','utf8');
    const title='Reduce card payment fees and recover margin | CAMBRA';
    expect(seo).toContain(title);
    expect(html).toContain(title);
    expect(seo).toContain('Réduire les frais de paiement par carte');
    expect(seo).toContain('Reducir comisiones de pago con tarjeta');
  });
  it('keeps the public journey to three plain-language steps',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      expect(source).toMatch(/3 steps|3 étapes|3 pasos/);
      expect(source).not.toMatch(/How it works · 4 steps|Comment ça marche · 4 étapes|Cómo funciona · 4 pasos/);
    }
  });
  it('labels the report preview as illustrative in every language',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      expect(source).toContain('ri_disclaimer:');
      expect(source).toMatch(/not a promise|ni promesse|no es una promesa/);
    }
    const preview=fs.readFileSync('src/components/landing/RealImpactSection.jsx','utf8');
    expect(preview).toContain('amount: 2_000_000');
    expect(preview).toContain('amount: 27_600');
    expect(preview).toContain('amount: 20_700');
    expect(preview).toContain('formatCurrency(46_000)');
    expect(preview).toContain('aria-describedby="report-preview-disclaimer"');
  });
  it('does not contradict the approved 24-month recovery term',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      const pricing=source.slice(source.indexOf('prc_split_eyebrow:'),source.indexOf('stack_h2_pre:'));
      expect(pricing).not.toMatch(/Cancel anytime|Annulable à tout moment|Cancela cuando quieras|No lock-in|Sans engagement, sans durée minimale|Sin permanencia, sin duración mínima/);
    }
  });
});
