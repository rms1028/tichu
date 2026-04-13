#!/usr/bin/env node
/**
 * android-dev.mjs — One-command Android dev cycle without EAS.
 *
 * Pipeline:
 *   1. expo export --platform android        → fresh Hermes bytecode (.hbc)
 *   2. Open base APK (a previously built     → swap assets/index.android.bundle
 *      EAS APK kept as a "shell"),              with the new .hbc, deflated
 *   3. zipalign + apksigner with debug key   → installable APK
 *   4. adb uninstall + install + launch      → run on USB-connected device
 *   5. screencap + logcat capture            → save under .android-dev/{screenshots,logs}/
 *   6. grep ReactNativeJS errors             → print to terminal
 *
 * Why this exists:
 *   EAS Build is rate-limited on the free plan and slow (15-25 min/build).
 *   Native modules don't change between dev iterations — only the JS bundle
 *   does. So we keep one base APK with the right native libs and swap the
 *   bundle in/out as fast as the JS rebuilds (≈ 30s per cycle).
 *
 * Prerequisites:
 *   - Android SDK installed (auto-detected from $ANDROID_HOME or default loc)
 *   - JDK installed (auto-detected; Android Studio's bundled JBR works)
 *   - Python 3 in PATH (used for zipfile manipulation — Node has no good zip)
 *   - .android-dev/base.apk in place (copy from a prior EAS build)
 *     If missing, the script falls back to C:/platform-tools/tichu-phase0.apk
 *     and tells you how to set it up properly.
 *   - USB-connected device with USB debugging authorized
 *
 * Usage:
 *   npm run android:dev          # full cycle
 *   WAIT_MS=12000 npm run android:dev   # longer wait for slow first paint
 *   SKIP_INSTALL=1 npm run android:dev  # rebuild + sign only, don't reinstall
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, statSync,
  rmSync, writeFileSync, copyFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// ── Paths ─────────────────────────────────────────────────────────────
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(SCRIPT_DIR, '..');
const CACHE = join(PROJECT, '.android-dev');
const BASE_APK = join(CACHE, 'base.apk');
const FALLBACK_BASE = 'C:/platform-tools/tichu-phase0.apk';
const SHOTS_DIR = join(CACHE, 'screenshots');
const LOGS_DIR = join(CACHE, 'logs');
const WORK_DIR = join(CACHE, 'work');

mkdirSync(CACHE, { recursive: true });
mkdirSync(SHOTS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });
mkdirSync(WORK_DIR, { recursive: true });

// ── Tiny logger ───────────────────────────────────────────────────────
const c = { gray: '\x1b[90m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' };
const log = (m) => console.log(`${c.cyan}›${c.reset} ${m}`);
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`);
const fail = (m) => { console.error(`${c.red}✗${c.reset} ${m}`); process.exit(1); };

// ── Shell helper ──────────────────────────────────────────────────────
function sh(cmd, opts = {}) {
  const res = spawnSync(cmd, {
    shell: true,
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...opts,
  });
  if (res.status !== 0 && !opts.allowFail) {
    const err = (res.stderr || '') + (res.stdout || '');
    fail(`Command failed (exit ${res.status}): ${cmd}\n${err}`);
  }
  return ((res.stdout || '') + (opts.captureStderr ? (res.stderr || '') : '')).trim();
}

// ── Locate Android SDK / JDK / build-tools / adb ──────────────────────
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

function findJdk() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:/Program Files/Android/Android Studio/jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const SDK = findAndroidSdk();
if (!SDK) fail('Android SDK not found. Set $ANDROID_HOME or install Android Studio.');

const JDK = findJdk();
if (!JDK) fail('JDK not found. Set $JAVA_HOME or install Android Studio.');

const buildToolsRoot = join(SDK, 'build-tools');
if (!existsSync(buildToolsRoot)) fail(`Build-tools missing: ${buildToolsRoot}`);
const btVersions = readdirSync(buildToolsRoot).filter((v) => /^\d/.test(v)).sort().reverse();
if (btVersions.length === 0) fail(`No build-tools found under ${buildToolsRoot}`);
const BT = join(buildToolsRoot, btVersions[0]);
const isWin = process.platform === 'win32';
const ZIPALIGN = join(BT, isWin ? 'zipalign.exe' : 'zipalign');
const APKSIGNER = join(BT, isWin ? 'apksigner.bat' : 'apksigner');
const ADB = join(SDK, 'platform-tools', isWin ? 'adb.exe' : 'adb');
const KEYTOOL = join(JDK, 'bin', isWin ? 'keytool.exe' : 'keytool');

for (const [name, p] of [['zipalign', ZIPALIGN], ['apksigner', APKSIGNER], ['adb', ADB], ['keytool', KEYTOOL]]) {
  if (!existsSync(p)) fail(`${name} missing: ${p}`);
}

// ── Base APK setup ────────────────────────────────────────────────────
let baseApk = BASE_APK;
if (!existsSync(baseApk)) {
  if (existsSync(FALLBACK_BASE)) {
    warn(`Base APK not in .android-dev/, using fallback ${FALLBACK_BASE}`);
    warn(`(Run \`cp "${FALLBACK_BASE}" "${BASE_APK}"\` to make it permanent.)`);
    baseApk = FALLBACK_BASE;
  } else {
    fail(
      `Base APK missing. Place a previously-built EAS APK at:\n` +
      `  ${BASE_APK}\n` +
      `This is a one-time setup. The native side (libs/, res/) stays the same;\n` +
      `we only swap the JS bundle inside.`
    );
  }
}

// ── Debug keystore (auto-create) ──────────────────────────────────────
const KEYSTORE = join(process.env.USERPROFILE || process.env.HOME || '', '.android', 'debug.keystore');
if (!existsSync(KEYSTORE)) {
  log('Creating debug keystore...');
  mkdirSync(dirname(KEYSTORE), { recursive: true });
  sh(
    `"${KEYTOOL}" -genkey -v -keystore "${KEYSTORE}" ` +
    `-storepass android -alias androiddebugkey -keypass android ` +
    `-keyalg RSA -keysize 2048 -validity 10000 ` +
    `-dname "CN=Android Debug,O=Android,C=US"`,
    { silent: true }
  );
  ok('Debug keystore created');
}

// ── Step 1: expo export ───────────────────────────────────────────────
log('Building Hermes bundle (expo export)...');
const exportDir = join(tmpdir(), `tichu-export-${Date.now()}`);
sh(`npx expo export --platform android --output-dir "${exportDir}"`, {
  cwd: PROJECT,
  silent: true,
  captureStderr: true,
});
const hbcDir = join(exportDir, '_expo', 'static', 'js', 'android');
const hbcFile = readdirSync(hbcDir).find((f) => f.endsWith('.hbc'));
if (!hbcFile) fail(`No .hbc emitted in ${hbcDir}`);
const hbcPath = join(hbcDir, hbcFile);
const hbcSize = (statSync(hbcPath).size / 1024 / 1024).toFixed(2);
ok(`Bundle: ${hbcFile} (${hbcSize} MB)`);

// ── Step 2: repack APK (Python because zipfile is the cleanest cross-platform option) ──
log('Repacking APK (swap JS bundle)...');
const unsignedApk = join(WORK_DIR, 'unsigned.apk');
const alignedApk = join(WORK_DIR, 'aligned.apk');
const signedApk = join(WORK_DIR, 'signed.apk');
[unsignedApk, alignedApk, signedApk].forEach((p) => existsSync(p) && rmSync(p));

const pyRepack = `
import zipfile, sys
src = sys.argv[1]; new_hbc = sys.argv[2]; dst = sys.argv[3]
with open(new_hbc, 'rb') as f: data = f.read()
with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w') as zout:
    for item in zin.infolist():
        if item.filename == 'assets/index.android.bundle':
            ni = zipfile.ZipInfo(item.filename); ni.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(ni, data)
        else:
            d = zin.read(item.filename)
            ni = zipfile.ZipInfo(item.filename); ni.compress_type = item.compress_type; ni.external_attr = item.external_attr
            zout.writestr(ni, d)
`.trim();

const pyScriptPath = join(WORK_DIR, 'repack.py');
writeFileSync(pyScriptPath, pyRepack);
sh(`python "${pyScriptPath}" "${baseApk}" "${hbcPath}" "${unsignedApk}"`, { silent: true });

// ── Step 3: zipalign + apksigner ──────────────────────────────────────
sh(`"${ZIPALIGN}" -p -f -v 4 "${unsignedApk}" "${alignedApk}"`, { silent: true });
sh(
  `"${APKSIGNER}" sign --ks "${KEYSTORE}" ` +
  `--ks-pass pass:android --key-pass pass:android ` +
  `--ks-key-alias androiddebugkey ` +
  `--out "${signedApk}" "${alignedApk}"`,
  { silent: true, env: { ...process.env, JAVA_HOME: JDK } }
);
const signedSize = (statSync(signedApk).size / 1024 / 1024).toFixed(1);
ok(`Signed APK: ${signedSize} MB`);

if (process.env.SKIP_INSTALL) {
  log(`SKIP_INSTALL set — APK ready at ${signedApk}`);
  process.exit(0);
}

// ── Step 4: detect device ─────────────────────────────────────────────
const devices = sh(`"${ADB}" devices`, { silent: true });
const deviceLines = devices
  .split('\n')
  .slice(1)
  .map((l) => l.trim())
  .filter((l) => l && /\tdevice$/.test(l));
if (deviceLines.length === 0) {
  fail(
    `No authorized device. Check:\n` +
    `  1. USB cable connected\n` +
    `  2. USB debugging enabled in developer options\n` +
    `  3. "Always allow from this computer" approved on the phone\n` +
    `  4. \`adb devices\` shows the device as 'device' (not 'unauthorized')`
  );
}
const deviceId = deviceLines[0].split(/\s+/)[0];
ok(`Device: ${deviceId}`);

// ── Step 5: install ───────────────────────────────────────────────────
log('Installing...');
sh(`"${ADB}" -s ${deviceId} uninstall com.tichu.app`, { silent: true, allowFail: true });
sh(`"${ADB}" -s ${deviceId} install -r "${signedApk}"`, { silent: true });
ok('Installed');

// ── Step 6: launch + screenshot + logcat ──────────────────────────────
log('Launching app...');
sh(`"${ADB}" -s ${deviceId} logcat -c`, { silent: true });
sh(`"${ADB}" -s ${deviceId} shell input keyevent KEYCODE_WAKEUP`, { silent: true });
sh(`"${ADB}" -s ${deviceId} shell am start -n com.tichu.app/.MainActivity`, { silent: true });

const waitMs = parseInt(process.env.WAIT_MS || '7000', 10);
log(`Waiting ${waitMs}ms for app to render...`);
await new Promise((r) => setTimeout(r, waitMs));

// Screenshot — pulls /sdcard/dev.png. Need MSYS_NO_PATHCONV=1 on Git Bash to
// prevent /sdcard from being mangled into a Windows path.
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const shotPath = join(SHOTS_DIR, `${ts}.png`);
const winEnv = { ...process.env, MSYS_NO_PATHCONV: '1' };
sh(`"${ADB}" -s ${deviceId} shell "screencap -p /sdcard/dev.png"`, { silent: true, env: winEnv });
sh(`"${ADB}" -s ${deviceId} pull /sdcard/dev.png "${shotPath}"`, { silent: true, env: winEnv });
ok(`Screenshot: ${shotPath}`);

// Logcat capture
const logPath = join(LOGS_DIR, `${ts}.log`);
const logcat = sh(`"${ADB}" -s ${deviceId} logcat -d ReactNativeJS:V *:S`, { silent: true });
writeFileSync(logPath, logcat);
ok(`Logcat: ${logPath}`);

// Highlight JS errors
const errorPattern = /TypeError|ReferenceError|SyntaxError|undefined is not|FAIL/i;
const errors = logcat.split('\n').filter((l) => errorPattern.test(l));
if (errors.length > 0) {
  console.log(`\n${c.red}▼ JS errors detected (${errors.length}):${c.reset}`);
  errors.slice(0, 15).forEach((l) => console.log(`  ${c.gray}${l}${c.reset}`));
  if (errors.length > 15) console.log(`  ${c.gray}... and ${errors.length - 15} more${c.reset}`);
} else {
  ok('No JS errors detected in logcat');
}

console.log(`\n${c.green}Done.${c.reset}`);
