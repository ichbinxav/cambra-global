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
  // DPA-1 (2026-08-16) — compile JSX the way production does. vite.config.js
  // uses @vitejs/plugin-react (automatic runtime), but this config had no jsx
  // setting, so tests fell back to the classic runtime and every jsdom-rendered
  // component needed an explicit `import React`. That made adding a render test
  // for an existing component fail with "React is not defined" in files the app
  // renders fine — a test-environment artifact, not a real defect. Aligning the
  // two removes the trap; components that already import React are unaffected.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    globals: true,
    // Several release tests intentionally spawn TypeScript/Vitest subprocesses
    // or reproduce the full Base44 bundle. Running those files concurrently
    // makes scheduler pressure look like a product defect and causes timeouts.
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
