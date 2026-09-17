import { defineConfig } from 'vitest/config';

/**
 * Tests for the build-time check scripts.
 *
 * <p>Separate from `ng test` for one concrete reason: these scripts read the
 * repository from disk, and anything that pulls application sources into the
 * application's own test bundle corrupts its coverage measurement — a source
 * file imported as raw text resolves to a one-line module, so every component
 * no test loads drops to zero countable lines. Keeping the scripts and their
 * tests outside that bundle is what keeps the coverage gate honest.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.spec.mjs'],
  },
});
