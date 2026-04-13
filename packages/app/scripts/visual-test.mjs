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

function launchApp() {
  adb(`logcat -c`, { silent: true });
  adb(`shell input keyevent KEYCODE_WAKEUP`, { silent: true });
  // Force-stop ensures a clean cold start, so screenshots capture the same
  // state every run regardless of whether the app was already foregrounded
  adb(`shell am force-stop com.tichu.app`, { silent: true });
  adb(`shell am start -n com.tichu.app/.MainActivity`, { silent: true });
}

function captureScreenshot(outPath) {
  adb(`shell screencap -p /sdcard/visual.png`, { silent: true });
  adb(`pull /sdcard/visual.png "${outPath}"`, { silent: true });
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
    launchApp();
  }

  for (const step of scenario.steps || []) {
    if (step.wait != null) await delay(step.wait);
    if (step.tap) tap(step.tap[0], step.tap[1]);
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
// IMPORTANT — coordinates are device-specific (this set is for a Samsung
// Galaxy with 2340x1080 landscape). For a different device, recapture
// each baseline, find button centers, and update the tap [x,y] entries.
//
// React Native + Reanimated views are NOT exposed to UIAutomator so
// `adb shell uiautomator dump` won't surface inner buttons. Use the
// PNG screenshots from `npm run android:dev` and read pixel coords off
// the image with any image viewer.
//
// HOST PREREQ for scenarios beyond `02-login`:
//   1. Local server running:  cd packages/server && npm run dev
//   2. ADB reverse:           adb reverse tcp:3001 tcp:3001
//   3. .env points to:        EXPO_PUBLIC_SERVER_URL=http://localhost:3001
//   4. Rebuild + install:     npm run android:dev
const SCENARIOS = [
  {
    name: '01-splash',
    settle: 1000,
    steps: [{ wait: 1500 }],
  },
  {
    name: '02-login',
    settle: 500,
    steps: [{ wait: 5000 }], // wait for splash → login transition
  },
  {
    name: '03-lobby',
    settle: 1500,
    // Login screen → type nickname → tap guest start → arrive at lobby
    steps: [
      { wait: 5000 },               // wait for login screen
      { tap: [1144, 434] },         // tap nickname input (center of input field)
      { wait: 800 },
      { text: 'Tester' },
      { wait: 300 },
      { key: 'KEYCODE_BACK' },      // dismiss keyboard
      { wait: 600 },
      { tap: [1144, 625] },         // tap "게스트로 시작" button
      { wait: 3500 },               // wait for guest_login round-trip + lobby render
    ],
  },
  // TODO — scenarios beyond the lobby (custom match → create room →
  // matchmaking → game → result) were attempted and did not complete
  // because ADB-injected taps don't seem to reach Reanimated-wrapped
  // touchables on the lobby cards (or the coordinates need more work
  // — this needs investigation). When extending:
  //   1. Run `npm run android:visual` and inspect baselines/03-lobby.png
  //   2. Find the "커스텀 모드 플레이" button center in the screenshot
  //   3. Add the next scenario, mirroring 03-lobby's tap pattern
  //   4. Verify by re-running `npm run android:visual`
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
