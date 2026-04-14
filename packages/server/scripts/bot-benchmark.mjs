#!/usr/bin/env node
/**
 * bot-benchmark.mjs — 수동 실행용 봇 AI 벤치마크 러너.
 *
 * 왜 별도 스크립트인가: `src/bot-benchmark.bench.ts` 는 vitest config 의
 * `include: ['src/**\/*.test.ts']` 에 안 걸리므로 CI 의 기본 test run 에서
 * 돌지 않는다. 하지만 수동으로 벤치가 필요할 때 단일 명령으로 돌리고
 * 싶어서 이 wrapper 가 있다.
 *
 * 실행:
 *   node packages/server/scripts/bot-benchmark.mjs
 *   npm run benchmark -w packages/server
 *
 * 출력: vitest reporter 기본 (verbose). 벤치 파일 내부에서 승률/라운드 수
 * 등을 console.log 한다. 결과가 CI 에 들어가지 않으니 수치 변동이 커도
 * merge 가 막히지 않는다 — 봇 성능 추적은 사람이 수치를 보고 판단.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(SCRIPT_DIR, '..');

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

const child = spawn(
  npx,
  [
    'vitest', 'run',
    '--config', 'vitest.bench.config.ts',
    '--reporter', 'verbose',
  ],
  { cwd: SERVER_DIR, stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 1));
