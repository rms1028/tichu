#!/usr/bin/env node
/**
 * visual-test.mjs — visual regression for the Android app.
 *
 * Launches the currently-installed APK, walks through a scripted sequence
 * of UI states, captures screenshots at each step, and compares each one
 * against a committed baseline. Diffs are detected by SHA-256 hash of the
 * PNG bytes — a starter "did anything change?" check. For pixel-level
 * diff add `pixelmatch` + `pngjs` and extend `compareImages()`.
 *
 * On first run (no baseline yet) the captured screenshot is adopted as
 * the baseline and the scenario passes. Subsequent runs flag any drift.
 *
 * Scenarios are declared inline at the bottom. Each entry can:
 *   - wait N ms
 *   - send an `adb shell input tap X Y` (interaction)
 *   - send text input
 *   - send a key event
 *
 * Usage:
 *   npm run android:visual                      # run all scenarios
 *   npm run android:visual -- --update-baselines  # adopt all current shots
 *   npm run android:visual -- --filter splash    # only matching scenarios
 *
 * Prereqs:
 *   - APK already installed (run `npm run android:dev` once first)
 *   - USB-connected device with debugging on
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync,
} from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// ── Paths ─────────────────────────────────────────────────────────────
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const VISUAL_DIR = join(APP_ROOT, 'visual-tests');
const BASELINES = join(VISUAL_DIR, 'baselines');
const CURRENT = join(VISUAL_DIR, 'current');

mkdirSync(BASELINES, { recursive: true });
mkdirSync(CURRENT, { recursive: true });

// ── Tiny logger ───────────────────────────────────────────────────────
const c = { gray: '\x1b[90m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' };
const log = (m) => console.log(`${c.cyan}›${c.reset} ${m}`);
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`);
const fail = (m) => console.error(`${c.red}✗${c.reset} ${m}`);
const die = (m) => { fail(m); process.exit(1); };

// ── ADB locator (same as android-dev.mjs) ─────────────────────────────
function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.USERPROFILE && join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'),
    process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk'),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const SDK = findAndroidSdk();
if (!SDK) die('Android SDK not found.');
const isWin = process.platform === 'win32';
const ADB = join(SDK, 'platform-tools', isWin ? 'adb.exe' : 'adb');
if (!existsSync(ADB)) die(`adb missing at ${ADB}`);

// ── Shell helper ──────────────────────────────────────────────────────
function sh(cmd, opts = {}) {
  const res = spawnSync(cmd, {
    shell: true,
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, MSYS_NO_PATHCONV: '1', ...opts.env },
  });
  if (res.status !== 0 && !opts.allowFail) {
    die(`Command failed: ${cmd}\n${(res.stderr || '') + (res.stdout || '')}`);
  }
  return (res.stdout || '').trim();
}

// ── ADB primitives ────────────────────────────────────────────────────
function adb(args, opts = {}) {
  return sh(`"${ADB}" -s ${DEVICE_ID} ${args}`, opts);
}

function getDevice() {
  const out = sh(`"${ADB}" devices`, { silent: true });
  const lines = out.split('\n').slice(1).map((l) => l.trim()).filter((l) => /\tdevice$/.test(l));
  if (lines.length === 0) die('No authorized device. Check `adb devices`.');
  return lines[0].split(/\s+/)[0];
}

const DEVICE_ID = getDevice();
ok(`Device: ${DEVICE_ID}`);

function launchApp({ resetData = false } = {}) {
  adb(`logcat -c`, { silent: true });
  adb(`shell input keyevent KEYCODE_WAKEUP`, { silent: true });
  // Samsung lockscreen: WAKEUP 만으로는 해제 안 됨. 위로 스와이프 필수.
  // 이미 unlock 상태면 swipe 는 무해 (홈 화면 제스처 무시).
  adb(`shell input swipe 540 1800 540 400 200`, { silent: true, allowFail: true });
  // Force-stop ensures a clean cold start, so screenshots capture the same
  // state every run regardless of whether the app was already foregrounded.
  // Also force-stop any app that tends to steal foreground on this dev phone —
  // injected taps go to the focused window, so a stray app eats the scenario.
  adb(`shell am force-stop com.openai.chatgpt`, { silent: true, allowFail: true });
  adb(`shell am force-stop com.samsung.android.app.notes`, { silent: true, allowFail: true });
  adb(`shell am force-stop com.tichu.app`, { silent: true });
  if (resetData) {
    // `pm clear` wipes MMKV + app files so the 03-lobby / 04-custom-match
    // scenarios always start from a fresh login screen. Without this, a saved
    // nickname routes straight to lobby and the login-step taps hit garbage,
    // corrupting the baseline (learned 2026-04-14 during fix/lobby).
    adb(`shell pm clear com.tichu.app`, { silent: true, allowFail: true });
  }
  adb(`shell am start -n com.tichu.app/.MainActivity`, { silent: true });
}

function captureScreenshot(outPath) {
  // `shell screencap -p <file>` 는 일부 Samsung One UI 빌드에서 -p 가
  // stdout-pipe 플래그로 잘못 해석돼 usage 에러가 난다 (2026-04-14 확인).
  // `exec-out` 로 PNG 를 바이너리 stdout 으로 뽑아 파일에 직접 쓰면 우회됨.
  // spawnSync 는 shell:false + 인자 배열로 불러야 Windows 에서 안전하게 바이너리 stdout 이 잡힌다.
  const res = spawnSync(ADB, ['-s', DEVICE_ID, 'exec-out', 'screencap', '-p'], {
    shell: false,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout || res.stdout.length === 0) {
    die(`screencap failed (status=${res.status}): ${res.stderr?.toString() || '(no stderr)'}`);
  }
  writeFileSync(outPath, res.stdout);
}

function tap(x, y) {
  adb(`shell input tap ${x} ${y}`, { silent: true });
}

function inputText(text) {
  // Spaces need escaping for `input text`
  const safe = text.replace(/ /g, '%s');
  adb(`shell input text "${safe}"`, { silent: true });
}

function pressKey(keycode) {
  adb(`shell input keyevent ${keycode}`, { silent: true });
}

function swipe(x1, y1, x2, y2, durationMs = 300) {
  adb(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`, { silent: true });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Demo mode (status bar stabilization) ─────────────────────────────
// Without this, every screenshot differs by status-bar clock / battery /
// notification icons, which makes byte-equal hashing useless. Demo mode
// is Android's built-in mechanism for app-store screenshots — it pins
// the status bar to a known state. Requires no root.
function enterDemoMode() {
  // Allow demo mode (one-time setting; idempotent)
  adb(`shell settings put global sysui_demo_allowed 1`, { silent: true, allowFail: true });
  // Enter demo mode
  adb(`shell am broadcast -a com.android.systemui.demo -e command enter`, { silent: true, allowFail: true });
  // Pin a fake clock
  adb(`shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200`, { silent: true, allowFail: true });
  // Pin a full battery
  adb(`shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false`, { silent: true, allowFail: true });
  // Hide notification icons
  adb(`shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false`, { silent: true, allowFail: true });
  // Show full network (WiFi 4 bars, mobile 4 bars)
  adb(`shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4`, { silent: true, allowFail: true });
  adb(`shell am broadcast -a com.android.systemui.demo -e command network -e mobile show -e datatype none -e level 4`, { silent: true, allowFail: true });
}

function exitDemoMode() {
  adb(`shell am broadcast -a com.android.systemui.demo -e command exit`, { silent: true, allowFail: true });
}

// ── Image comparison (pixel-level with status bar mask) ─────────────
//
// Pure SHA-256 comparison fails because (a) Samsung's One UI ignores
// the stock Android demo-mode broadcasts so the status bar clock keeps
// ticking, and (b) anti-aliasing varies subtly between renders. So we
// use pixelmatch with:
//   - includeAA: false      (ignore anti-aliasing differences)
//   - threshold: 0.1        (default — moderate)
//   - maskTopPx: 100        (zero out the status bar + LAYOUT OK banner)
// Pass if < 1% of the remaining pixels differ.

const MASK_TOP_PX = 100; // status bar height in landscape on this device
const DIFF_TOLERANCE_PCT = 0.1; // strict — catches small text/icon changes

function readPng(filePath) {
  const buf = readFileSync(filePath);
  return PNG.sync.read(buf);
}

function maskTopBand(png, topPx) {
  // Zero (0,0,0,255) the top `topPx` rows so they don't count toward diff.
  // Apply to a *copy* via mutation; pngjs returns a typed array that we
  // can edit directly.
  const { width, data } = png;
  const bytes = Math.min(topPx * width * 4, data.length);
  for (let i = 0; i < bytes; i++) data[i] = i % 4 === 3 ? 255 : 0;
  return png;
}

function compareImages(currentPath, baselinePath) {
  if (!existsSync(baselinePath)) return { status: 'new' };

  const cur = readPng(currentPath);
  const base = readPng(baselinePath);

  if (cur.width !== base.width || cur.height !== base.height) {
    return {
      status: 'differ',
      reason: `dimensions differ: current=${cur.width}x${cur.height}, baseline=${base.width}x${base.height}`,
    };
  }

  maskTopBand(cur, MASK_TOP_PX);
  maskTopBand(base, MASK_TOP_PX);

  const diff = new PNG({ width: cur.width, height: cur.height });
  const numDiff = pixelmatch(
    base.data, cur.data, diff.data,
    cur.width, cur.height,
    { threshold: 0.1, includeAA: false },
  );
  const totalPixels = cur.width * cur.height;
  const diffPct = (numDiff / totalPixels) * 100;

  if (diffPct <= DIFF_TOLERANCE_PCT) {
    return { status: 'match', diffPct };
  }
  // Save a visual diff for debugging
  const diffPath = currentPath.replace(/\.png$/, '.diff.png');
  writeFileSync(diffPath, PNG.sync.write(diff));
  return { status: 'differ', diffPct, diffPath };
}

// ── Scenario runner ───────────────────────────────────────────────────
async function runScenario(scenario) {
  log(`Scenario: ${scenario.name}`);

  if (scenario.relaunch !== false) {
    launchApp({ resetData: scenario.resetData === true });
  }

  for (const step of scenario.steps || []) {
    if (step.wait != null) await delay(step.wait);
    if (step.tap) tap(step.tap[0], step.tap[1]);
    if (step.swipe) swipe(step.swipe[0], step.swipe[1], step.swipe[2], step.swipe[3], step.swipe[4]);
    if (step.text) inputText(step.text);
    if (step.key) pressKey(step.key);
  }

  // Final settle wait before capture
  await delay(scenario.settle ?? 500);

  const fileName = `${scenario.name}.png`;
  const currentPath = join(CURRENT, fileName);
  const baselinePath = join(BASELINES, fileName);
  captureScreenshot(currentPath);

  const result = compareImages(currentPath, baselinePath);

  if (UPDATE_BASELINES || result.status === 'new') {
    copyFileSync(currentPath, baselinePath);
    if (result.status === 'new') {
      warn(`  baseline not found — adopted current as baseline`);
    } else {
      ok(`  baseline updated`);
    }
    return { name: scenario.name, status: 'baseline-updated' };
  }

  if (result.status === 'match') {
    ok(`  matches baseline (diff ${result.diffPct.toFixed(3)}%)`);
    return { name: scenario.name, status: 'pass' };
  }

  fail(`  differs from baseline${result.diffPct != null ? ` (diff ${result.diffPct.toFixed(3)}%)` : ''}${result.reason ? ` — ${result.reason}` : ''}`);
  fail(`  baseline: ${relative(APP_ROOT, baselinePath)}`);
  fail(`  current:  ${relative(APP_ROOT, currentPath)}`);
  if (result.diffPath) fail(`  diff:     ${relative(APP_ROOT, result.diffPath)}`);
  return { name: scenario.name, status: 'fail' };
}

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UPDATE_BASELINES = args.includes('--update-baselines') || args.includes('-u');
const filterIdx = args.findIndex((a) => a === '--filter' || a === '-f');
const FILTER = filterIdx >= 0 ? args[filterIdx + 1] : null;

// ── Scenario definitions ──────────────────────────────────────────────
//
// Add scenarios here as the app grows. Each scenario relaunches the app
// from scratch by default (`relaunch: true`) so failures in one don't
// cascade. Set `relaunch: false` to chain steps from the previous state.
//
// IMPORTANT — 2026-04-15 portrait lock 이후 기존 landscape (2340×1080)
// baseline 10개 전부 무효화. 이 파일은 portrait (1080×2340) 기준으로
// 01-splash / 02-login 두 개만 유지 — 이 둘은 ADB tap 이 필요 없어
// 안정적. 03~10 은 portrait 좌표 재튜닝 필요해서 제거 (향후 device
// 있는 세션에서 재추가).
//
// 좌표 기준: Samsung 1080×2340 portrait. 기기 다르면 screenshot 받아
// 픽셀 좌표 재측정 필요.
//
// React Native + Reanimated views are NOT exposed to UIAutomator so
// `adb shell uiautomator dump` won't surface inner buttons. Use the
// PNG screenshots from `npm run android:dev` and read pixel coords off
// the image with any image viewer.
//
// 첫 실행 시:
//   1. `npm run android:dev` 로 APK 설치 (현재 base.apk)
//   2. `npm run android:visual -- --update-baselines` 로 baseline 생성
//   3. 이후 `npm run android:visual` 로 회귀 체크
// ⚠️ 시나리오 순서는 중요: resetData:true (pm clear) 를 쓰는 01-splash /
// 02-login 은 nickname 을 날리므로 **맨 뒤**에 둬야 한다. 그렇지 않으면
// 03+ 가 전부 login 화면을 찍는다. 3~10 은 tester 로그인 + 오늘 출석
// claim 된 상태를 전제. 초기 셋업 1회:
//   1. 수동으로 tester 닉네임 guest 로그인
//   2. 출석 모달의 '보상 받기' 탭 (or `adb shell input tap 540 1290`)
//   3. adb shell pm grant com.tichu.app android.permission.POST_NOTIFICATIONS
// 이후 `npm run android:visual -- --update-baselines` 로 전체 생성.
const SCENARIOS = [
  {
    name: '03-lobby-home',
    settle: 1500,
    steps: [{ wait: 6000 }], // splash → lobby 렌더
  },
  {
    name: '04-ranking',
    settle: 1500,
    steps: [
      { wait: 6000 },
      { tap: [540, 2120] },  // bottom nav 랭킹 탭 (center)
      { wait: 2000 },
    ],
  },
  {
    name: '05-settings',
    settle: 1500,
    steps: [
      { wait: 6000 },
      { tap: [905, 2120] },  // bottom nav 설정 탭 (right)
      { wait: 2000 },
    ],
  },
  {
    name: '06-shop',
    settle: 1500,
    steps: [
      { wait: 6000 },
      { tap: [840, 205] },   // top-right 🛒 shop icon
      { wait: 2000 },
    ],
  },
  {
    name: '07-friends-panel',
    settle: 1500,
    steps: [
      { wait: 6000 },
      { tap: [970, 205] },   // top-right 👥 friends icon
      { wait: 2000 },
    ],
  },
  // 08-profile: SKIP — LobbyScreen.profileBtn 는 flexDirection:row 의
  // TouchableOpacity 라 CLAUDE.md §4.4 의 ADB tap hit-test 버그에 걸림.
  // 좌표 여러 곳 시도했으나 전부 앱 바깥으로 튕김. test-mode deeplink
  // 구현 (§2단계 미완) 후 복구 예정.
  {
    name: '09-custom-match',
    settle: 2000,
    steps: [
      { wait: 6000 },
      { tap: [760, 1180] },  // 커스텀 모드 card 의 플레이 버튼
      { wait: 2500 },
    ],
  },
  {
    name: '10-rules',
    settle: 1500,
    steps: [
      { wait: 6000 },
      { tap: [540, 1592] },  // 게임 규칙 row
      { wait: 2000 },
    ],
  },
  // ⚠️ 여기서부터는 resetData:true — **마지막**에 실행해야 앞 시나리오가
  // 쓸 tester 세션을 보존.
  {
    name: '01-splash',
    resetData: true,    // 매 실행 cold start 해야 splash → login 전환이 재현 가능
    settle: 1000,
    steps: [{ wait: 1500 }],
  },
  {
    name: '02-login',
    resetData: true,    // pm clear → saved nickname 날려서 항상 login 부터 시작
    settle: 500,
    steps: [{ wait: 5000 }], // wait for splash → login transition
  },
];


// ── Main ──────────────────────────────────────────────────────────────
const filtered = FILTER
  ? SCENARIOS.filter((s) => s.name.includes(FILTER))
  : SCENARIOS;

if (filtered.length === 0) {
  die(`No scenarios matched filter: ${FILTER}`);
}

log('Entering demo mode (pinning status bar)...');
enterDemoMode();

log(`Running ${filtered.length} scenario(s)...`);

const results = [];
try {
  for (const s of filtered) {
    results.push(await runScenario(s));
  }
} finally {
  exitDemoMode();
}

console.log('');
console.log('Summary:');
const pass = results.filter((r) => r.status === 'pass').length;
const updated = results.filter((r) => r.status === 'baseline-updated').length;
const failed = results.filter((r) => r.status === 'fail').length;
console.log(`  ${c.green}pass:${c.reset} ${pass}`);
if (updated > 0) console.log(`  ${c.yellow}baseline updated:${c.reset} ${updated}`);
if (failed > 0) console.log(`  ${c.red}fail:${c.reset} ${failed}`);

process.exit(failed > 0 ? 1 : 0);
