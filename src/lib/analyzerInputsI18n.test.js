// analyzerInputsI18n.test.js — guard: the Analyzer input components must not
// carry hardcoded user-facing English.
//
// Why this test exists (2026-08-16): the four input components of the payments
// Analyzer (GMV, average ticket, international share, debit/credit mix) plus the
// combined-channel block shipped with ZERO `t()` calls. A Spanish, German or
// Czech merchant filled a form whose every label, hint, placeholder and
// aria-label was English — including a `toLocaleString("en-US")` that showed a
// German merchant "€25,000" instead of "25.000 €".
//
// This is not a style rule. The GMV field is the single most consequential input
// in the product: if the merchant misreads it and includes cash, the effective
// rate is understated and the apparent saving doubles, and nothing downstream
// can detect it. A label the merchant cannot read is a correctness problem.
//
// R4: this test protects an invariant. If a component legitimately needs a
// literal (a brand name, a symbol), add it to ALLOWED_LITERALS with a reason.
// Never delete the assertion.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import en from './locales/en.js';
import es from './locales/es.js';
import de from './locales/de.js';

const COMPONENT_DIR = path.resolve(process.cwd(), 'src/components/paymentsAnalyzer');

const GUARDED_COMPONENTS = [
  'GmvSlider.jsx',
  'AvgTicketInput.jsx',
  'IntlSlider.jsx',
  'CardMixSlider.jsx',
  'CombinedChannelBlock.jsx',
  'CurrencyField.jsx',
];

// Literals that are legitimately not translatable. Each needs a reason.
const ALLOWED_LITERALS = new Set([
  'range',        // <input type="range"> — HTML enum, not copy
  'number',       // <input type="number">
  'numeric',      // inputMode
  'decimal',      // inputMode
  'button',       // <button type="button">
  'currency',     // Intl.NumberFormat style
  'compact',      // Intl.NumberFormat notation
  'EUR',          // ISO 4217 code passed to Intl, not displayed as-is
]);

// Strip line and block comments so prose in comments (which is developer-facing,
// not user-facing) does not trip the scan.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function readGuarded(file) {
  return stripComments(fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8'));
}

describe('Analyzer input components are fully internationalized', () => {
  it('every guarded component imports and uses the translation hook', () => {
    for (const file of GUARDED_COMPONENTS) {
      const src = readGuarded(file);
      expect(src, `${file} must import useTranslation`).toMatch(/useTranslation/);
      expect(src, `${file} must call t()`).toMatch(/\bt\("/);
    }
  });

  it('no user-facing attribute carries a raw string literal', () => {
    // aria-label / placeholder / title are read aloud or shown to the user.
    const offenders = [];
    for (const file of GUARDED_COMPONENTS) {
      const src = readGuarded(file);
      for (const m of src.matchAll(/\b(aria-label|placeholder|title)\s*=\s*"([^"]*)"/g)) {
        if (!ALLOWED_LITERALS.has(m[2])) offenders.push(`${file}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no JSX text node contains prose', () => {
    // A JSX text node is anything between > and < that is not pure markup.
    // Prose = contains at least two consecutive letters. Symbols like "—",
    // "/" or "%" alone are fine.
    //
    // The lookarounds keep JS operators out of the scan: `=>` and `>=` are not
    // tag boundaries, and a run containing `(`, `)`, `;` or `=` is code, not
    // copy. Without them the arrow function in AvgTicketInput and the range
    // checks in the sliders read as "prose".
    const offenders = [];
    for (const file of GUARDED_COMPONENTS) {
      const src = readGuarded(file);
      for (const m of src.matchAll(/(?<![=!<>-])>(?!=)([^<>{}();=]+)</g)) {
        const text = m[1].trim();
        if (text.length > 0 && /[A-Za-z]{2}/.test(text) && !ALLOWED_LITERALS.has(text)) {
          offenders.push(`${file}: >${text}<`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the GMV field never formats currency with a hardcoded locale or symbol', () => {
    // The original bug: `"€" + n.toLocaleString("en-US")`. Currency formatting
    // must go through the active language's formatter so grouping, decimals and
    // symbol POSITION follow the merchant's locale (25.000 € in de, €25,000 in en).
    for (const file of GUARDED_COMPONENTS) {
      const src = readGuarded(file);
      expect(src, `${file} must not pin a locale`).not.toMatch(/toLocaleString\(\s*["']en/);
      expect(src, `${file} must not hardcode a currency symbol in template output`)
        .not.toMatch(/`€\$\{/);
    }
  });

  it('every key the components reference exists in every shipped language', () => {
    const referenced = new Set();
    for (const file of GUARDED_COMPONENTS) {
      for (const m of readGuarded(file).matchAll(/\bt\("([a-z0-9_]+)"\)/g)) {
        referenced.add(m[1]);
      }
    }
    // Sanity: the scan actually found the keys, so a refactor that silently
    // removes all t() calls cannot make this test vacuously pass.
    expect(referenced.size).toBeGreaterThanOrEqual(24);

    const missing = [];
    for (const key of referenced) {
      for (const [lang, dict] of Object.entries({ en, es, de })) {
        if (!(key in dict)) missing.push(`${lang}:${key}`);
        else if (dict[key] === '') missing.push(`${lang}:${key} (empty)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the GMV label asks for card sales, not jargon or ambiguous revenue', () => {
    // A merchant who reads "revenue" or "GMV" and includes cash or transfers
    // inflates the divisor and halves their apparent effective rate. The label
    // and its help text must both scope the figure to card payments.
    expect(en.az_lbl_gmv).toMatch(/card/i);
    expect(en.az_lbl_gmv).not.toMatch(/\bGMV\b/);
    expect(en.az_gmv_help).toMatch(/cash/i);
    expect(es.az_lbl_gmv).toMatch(/tarjeta/i);
    expect(es.az_gmv_help).toMatch(/efectivo/i);
    expect(de.az_gmv_help).toMatch(/Bargeld/i);
  });
});
