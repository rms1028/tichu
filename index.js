// Monorepo entry stub for Expo prebuild Android bundling.
//
// react-native-gradle-plugin computes `--entry-file` as the basename
// ('index.js') against working dir `packages/app/`, but with
// `EXPO_USE_METRO_WORKSPACE_ROOT=1` (default in SDK 52+) Metro's project
// root is the workspace root. So Metro looks for `./index.js` at the
// workspace root and fails. This stub satisfies that lookup and forwards
// to the real RN entry inside packages/app.
//
// Only used by `gradlew assembleRelease` from `packages/app/android/`.
// Runtime / dev-server / Expo Router never load this file.
require('./packages/app/index.js');
