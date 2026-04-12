// Expo monorepo Metro 설정 — @tichu/shared 등 워크스페이스 패키지 해석용
// 참고: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. 워크스페이스 루트 전체를 watch (shared 패키지 변경 감지)
config.watchFolders = [workspaceRoot];

// 2. Metro가 node_modules 을 두 군데서 찾도록 (app 로컬 + 루트 hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. 중복 node_modules lookup 방지 — hoisted 패키지 중복 해석 방지
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
