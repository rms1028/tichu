// Expo monorepo Metro 설정 — @tichu/shared 등 워크스페이스 패키지 해석용
// 참고: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. 워크스페이스 루트를 watch 에 추가 (Expo 기본 watchFolders 유지 + 확장)
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// 2. Metro가 node_modules 을 두 군데서 찾도록 (app 로컬 + 루트 hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
