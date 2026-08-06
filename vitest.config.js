import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Root vitest config — picks up tests across src/ and base44/.
// scoreEngine.js and other pure-logic tests run in node (no DOM).
// ESM-safe __dirname equivalent (no Node CommonJS globals in this file).
// v62.2.1: this file must live at the REPO ROOT. It was exported under src/ in
// v62.2, so `vitest run` from the root used defaults and the '@' alias did not
// resolve.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});