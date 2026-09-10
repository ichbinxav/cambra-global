import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const copy=(lang)=>fs.readFileSync(`src/lib/locales/${lang}.js`,'utf8');

describe('human-first and SEO-first public copy seal',()=>{
  it('gives each supported language a native, customer-readable promise',()=>{
    expect(copy('en')).toContain('Know what accepting payments');
    expect(copy('fr')).toContain("Comprenez ce que l'acceptation des paiements");
    expect(copy('es')).toContain('Descubre cuánto cuesta realmente');
  });
  it('states the economic promise without guaranteeing savings',()=>{
    for(const lang of ['en','fr','es']){
      const source=copy(lang);
      expect(source).toMatch(/confirmed|confirmées|confirma/);
      expect(source).not.toMatch(/guaranteed savings|économies garanties|ahorro garantizado/i);
    }
  });
  it('seals the PSP and merchant commercial model across all 23 locales',()=>{
    const localeFiles=fs.readdirSync('src/lib/locales').filter((name)=>name.endsWith('.js'));
    expect(localeFiles).toHaveLength(23);
    for(const file of localeFiles){
      const source=fs.readFileSync(`src/lib/locales/${file}`,'utf8');
      const merchantModel=source.match(/^\s*fp_merchant_model:\s*"([^"]+)"/m)?.[1] || '';
      const pricingV2=source.match(/^\s*prc_faq_a2_v2:\s*"([^"]+)"/m)?.[1] || '';
      const pricingSuffix=source.match(/^\s*pd_t2_suffix:\s*"([^"]+)"/m)?.[1] || '';
      expect(merchantModel, file).toMatch(/25/);
      expect(merchantModel, file).toMatch(/24/);
      expect(pricingV2, file).toMatch(/25/);
      expect(pricingV2, file).toMatch(/24/);
      expect(pricingV2, file).not.toMatch(/1[–-]12|13[–-]24|tiered/i);
      expect(pricingSuffix, file).toMatch(/24/);
      expect(pricingSuffix, file).not.toMatch(/→|1[–-]12|13[–-]24/);
      expect(source).not.toMatch(/^\s*ref_fee_y[12]_label:|^\s*ref_next_step_v2:/m);
    }

    const pricingDual=fs.readFileSync('src/components/landing/PricingDual.jsx','utf8');
    const providerPage=fs.readFileSync('src/pages/ForProviders.jsx','utf8');
    const help=fs.readFileSync('src/lib/helpCenterContent.js','utf8');
    const seo=fs.readFileSync('src/lib/seoConfig.js','utf8');
    expect(pricingDual).not.toMatch(/25→15|pd_t2_suffix_v2|recoveryV2Available/);
    expect(providerPage).toContain('t("fp_merchant_model")');
    expect(help).toContain('Who contracts with and invoices the merchant?');
    expect(help).toContain('pays CAMBRA no commission, referral fee, revenue share or other compensation');
    expect(seo).toContain('proposed terms remain indicative until written approval');
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
