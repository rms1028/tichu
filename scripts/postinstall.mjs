// 크로스 플랫폼 postinstall 스크립트
//
// 목적: @tichu/shared 를 자동 빌드해서 @tichu/app 과 @tichu/server 가
// 런타임에 dist/ 를 찾을 수 있도록 한다.
//
// 컨텍스트:
// - EAS Build: 워크스페이스 전체를 업로드 → 소스 + tsconfig 존재 → 빌드 진행
// - Railway: Dockerfile 단계화로 postinstall 시점에는 package.json 만 복사됨
//   → tsconfig.json 없음 → tsc 가 help 출력 후 실패
// - 로컬 개발: npm install 시 전체 소스 존재 → 빌드 진행
//
// 그래서: tsconfig.json 존재 여부로 분기. 없으면 스킵.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const sharedTsconfig = path.join('packages', 'shared', 'tsconfig.json');

if (!existsSync(sharedTsconfig)) {
  console.log('[postinstall] packages/shared source not present — skipping shared build (Railway docker stage will rebuild later).');
  process.exit(0);
}

console.log('[postinstall] Building @tichu/shared ...');
const result = spawnSync('npm', ['run', 'build', '-w', 'packages/shared'], {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
