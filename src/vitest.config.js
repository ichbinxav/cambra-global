import { defineConfig } from 'vitest/config';

// Minimal Vitest config for pure-logic unit tests (M0B).
// scoreEngine.js is framework-free pure logic, so tests run in a plain node
// environment with no DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    globals: true,
  },
});