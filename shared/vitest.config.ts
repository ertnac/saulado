import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Plan §Phase 1 done-when: coverage on the cloze engine above 95%.
      // The threshold is enforced rather than eyeballed, so a future change
      // that adds an untested branch fails CI instead of quietly drifting.
      include: ['src/cloze/**/*.ts', 'src/scheduler/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
})
