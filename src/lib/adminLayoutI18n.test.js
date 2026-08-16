import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/admin/AdminLayout.jsx'), 'utf8');
const dictionaryMatch = source.match(/export const ADMIN_LAYOUT_COPY = (\{[\s\S]*?\n\});\n\nexport function adminLayoutText/);
const ADMIN_LAYOUT_COPY = Function(`"use strict"; return (${dictionaryMatch?.[1] || '{}'});`)();

describe('Admin shell internationalization', () => {
  it('keeps complete EN/FR/ES dictionary parity and translates every navigation entry', () => {
    const englishKeys = Object.keys(ADMIN_LAYOUT_COPY.en).sort();
    expect(Object.keys(ADMIN_LAYOUT_COPY.fr).sort()).toEqual(englishKeys);
    expect(Object.keys(ADMIN_LAYOUT_COPY.es).sort()).toEqual(englishKeys);
    expect(englishKeys.length).toBeGreaterThan(60);

    const navLabels = [...source.matchAll(/\{ path: "\/admin[^\n]+?label: "([^"]+)"/g)].map((match) => match[1]);
    expect(navLabels.length).toBeGreaterThan(35);
    for (const label of navLabels) expect(englishKeys).toContain(`nav.${label}`);
  });

  it('renders localized shell copy and interpolates access context without changing routes', () => {
    expect(ADMIN_LAYOUT_COPY.fr['nav.Settings']).toBe('Paramètres');
    expect(ADMIN_LAYOUT_COPY.es['nav.Founder Control']).toBe('Control del Fundador');
    expect(ADMIN_LAYOUT_COPY.es.account_role).toContain('{role}');
    expect(source).toContain('copy(`nav.${item.label}`)');
    expect(source).toContain('copy(`group.${group}`)');
    expect(source).toContain('to={item.path}');
    expect(source).toContain('<LanguageSwitcher');
  });

  it('loads the persisted admin language once without blocking the shell on failure', () => {
    expect(source).toContain('{ view: "settings", section: "language_region" }');
    expect(source).toContain('syncedPreferenceFor.current === identity');
    expect(source).toContain('["en", "fr", "es"].includes(preferred)');
    expect(source).toContain('.catch(() => {})');
  });
});
