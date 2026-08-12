import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const copy=(lang)=>fs.readFileSync(`src/lib/locales/${lang}.js`,'utf8');

describe('human-first and SEO-first public copy seal',()=>{
  it('gives each supported language a native, customer-readable promise',()=>{
    expect(copy('en')).toContain('Find out what your payments');
    expect(copy('fr')).toContain('Découvrez ce que vos paiements');
    expect(copy('es')).toContain('Descubre cuánto te cuestan');
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
    const title='Card payment cost audit for European businesses | CAMBRA';
    expect(seo).toContain(title);
    expect(html).toContain(title);
    expect(seo).toContain('Audit des frais de paiement par carte en Europe');
    expect(seo).toContain('Auditoría de costes de pago con tarjeta en Europa');
  });
});
