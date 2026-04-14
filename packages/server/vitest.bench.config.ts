import { defineConfig } from 'vitest/config';

// Separate vitest config for manual benchmark runs. The default
// `vitest.config.ts` only includes *.test.ts, so .bench.ts files are
// out of CI scope. This config flips the include so bench files run —
// invoked via `npm run benchmark -w packages/server` or the mjs
// wrapper at `scripts/bot-benchmark.mjs`.
export default defineConfig({
  test: {
    include: ['src/**/*.bench.ts'],
    testTimeout: 600_000, // 10 minutes — 500-game matchups take a while
  },
});
