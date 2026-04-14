// Minimal react-native shim for vitest unit tests in packages/app.
//
// Running the real react-native bundle under Node crashes on missing
// native modules. Our unit tests only need the handful of module-level
// shapes that pure-logic files import at load time — mainly `Platform`
// from `react-native`. Anything more (UI components, native modules)
// belongs in a separate integration/E2E suite, not here.
//
// Keep this file small. If a new import is needed, add it as a minimal
// stub and note why. We intentionally do NOT export UI components —
// tests that need rendering should use a dedicated tool like
// @testing-library/react-native, not this shim.

export const Platform = {
  OS: 'test' as const,
  select: <T,>(obj: { [key: string]: T }): T | undefined =>
    obj.test ?? obj.default ?? obj.native ?? undefined,
};

// expo-av / gesture-handler / reanimated etc. should never be imported
// by pure-logic code. If a test fails because one of those got pulled
// in, fix the import graph instead of adding more shims here.
