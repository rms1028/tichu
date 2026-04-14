import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vitest config for pure-logic unit tests in packages/app.
//
// Scope: small, Node-runnable tests that verify state reducers and
// utility functions — no UI rendering, no real react-native bundle.
// Tests that need native modules (MMKV / expo-av / Reanimated) should
// not live here; they'd pull in the whole mobile runtime and crash.
//
// The `react-native` alias points at a minimal shim (test/mocks/
// react-native.ts) that only exports `Platform`. If a test reaches
// for anything beyond that, rethink the import graph rather than
// growing the shim.
//
// This file is excluded from tsconfig (see tsconfig.json "exclude")
// so the `import.meta.url` syntax doesn't have to fight the app's
// Expo module preset — vitest itself runs this file under Node ESM
// where import.meta is native.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      'react-native': resolve(__dirname, 'test/mocks/react-native.ts'),
    },
  },
});
