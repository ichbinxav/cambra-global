import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LEGAL_NAME = 'CAMBRA GLOBAL SASU';
const SIREN = '105 452 916';
const ADDRESS = '47 rue Vivienne, 75002 Paris';

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
      expect(source, file).toContain(ADDRESS);
      expect(source, file).toContain(SIREN);
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
});
