// Expo SDK 52+ monorepo Metro 설정.
//
// SDK 52 부터는 `expo/metro-config` 가 monorepo 를 자동 감지한다
// (EXPO_USE_METRO_WORKSPACE_ROOT 가 기본 활성).  watchFolders 나
// resolver.nodeModulesPaths 를 수동으로 잡으면 JS 측과 네이티브 측이
// 같은 패키지의 서로 다른 복사본을 보게 되어 TurboModule 등록이
// 어긋나고, Bridgeless 모드에서 흰 화면 + `TypeError: undefined is
// not a function` 으로 죽는다.  공식 가이드 권고대로 최소 설정만 둔다.
//
// 참고: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
