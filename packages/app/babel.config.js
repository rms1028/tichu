// ⚠️ monorepo / workspace 환경에서는 babel-preset-expo 의 reanimated
// 자동 감지가 실패하는 경우가 있어, react-native-reanimated/plugin 을
// 명시적으로 등록한다. 이 플러그인이 빠지면 모든 worklet 호출이
// 런타임에 `TypeError: undefined is not a function` 으로 터져 앱이
// 흰 화면으로 멈춘다 — 그게 어제까지 7번 넘게 고친 그 버그.
//
// 플러그인은 반드시 `plugins` 배열의 **마지막**에 위치해야 한다.

// monorepo + 커스텀 entry(index.js) 조합에서 babel-preset-expo 가
// EXPO_ROUTER_APP_ROOT 를 자동 주입하지 못해 expo-router v4 의
// require.context 가 빈 라우트로 번들링되고 "No routes found" 로
// 죽는다. 절대경로로 선주입해 고정한다.
const path = require('path');
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
