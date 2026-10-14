import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Dedicated Vitest config.
 *
 * Kept separate from `vite.config.ts` on purpose: the app config pulls in the
 * React plugin, the Tailwind v4 plugin and browser-targeted settings, none of
 * which the server-side logic tests need. Loading them would slow the suite
 * down and can fail on DOM-only transforms.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The repo has no test suite at all today (Phase 4 of the hardening
    // backlog). These cover the pure server-side logic that the security
    // fixes depend on.
    reporters: 'default',
    globals: false,
  },
})
