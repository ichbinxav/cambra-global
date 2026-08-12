import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LEGAL_NAME = 'CAMBRA Global SASU';
const SIREN = '105 452 916';
const SIRET = '105 452 916 00015';
const VAT = 'FR50105452916';
const STREET = '47 rue Vivienne';
const DOMICILIATION = 'Chez Vivienne Domiciliation';
const POSTCODE = '75002';

const USER_VISIBLE_IDENTITY_FILES = [
  'src/pages/Landing.jsx',
  'src/components/shared/PublicFooter.jsx',
  'src/content/legal/en/privacy.js',
  'src/content/legal/fr/privacy.js',
  'src/content/legal/es/privacy.js',
  'src/content/legal/en/terms.js',
  'src/content/legal/fr/terms.js',
  'src/content/legal/es/terms.js',
  'src/content/legal/en/cookies.js',
  'src/content/legal/fr/cookies.js',
  'src/content/legal/es/cookies.js',
];

describe('CAMBRA legal identity consistency', () => {
  it('uses the canonical registered address on every user-visible legal identity surface', () => {
    for (const file of USER_VISIBLE_IDENTITY_FILES) {
      const source = read(file);
      expect(source, file).toContain(STREET);
      expect(source, file).toContain(POSTCODE);
      expect(source, file).toContain(SIREN);
      expect(source, file).toContain(SIRET);
      expect(source, file).toContain(VAT);
      expect(source, file).toContain(DOMICILIATION);
    }
  });

  it('does not expose the superseded 42 rue Vivienne address on merchant/public surfaces', () => {
    for (const file of USER_VISIBLE_IDENTITY_FILES) {
      expect(read(file), file).not.toContain('42 rue Vivienne');
    }
  });

  it('keeps the canonical legal name on public identity surfaces', () => {
    for (const file of ['src/pages/Landing.jsx','src/components/shared/PublicFooter.jsx','src/content/legal/en/privacy.js']) {
      expect(read(file), file).toContain(LEGAL_NAME);
    }
  });

  it('does not publish internal French tax-office ROF identifiers', () => {
    const internalOnly = ['ROF IS1', 'ROF TVA1', 'ROF CFE1', 'ROF CVAE1', 'ROF RCM1'];
    for (const file of USER_VISIBLE_IDENTITY_FILES) {
      const source = read(file);
      for (const token of internalOnly) expect(source, `${file}: ${token}`).not.toContain(token);
    }
  });
});
