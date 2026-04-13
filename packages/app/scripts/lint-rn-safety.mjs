#!/usr/bin/env node
/**
 * lint-rn-safety.mjs — block top-level Web API calls that crash on React Native.
 *
 * Today's bug (2026-04-13) cost us a day:
 *
 *   // sound.ts (top level)
 *   if (typeof window !== 'undefined') {
 *     window.addEventListener('touchstart', unlockAudio, { once: true });
 *   }
 *
 * In React Native, `window` is polyfilled as an empty object, so the typeof
 * check passes — but `window.addEventListener` is undefined. Calling undefined
 * throws TypeError: undefined is not a function at module-load time. The
 * throw breaks every static import that depends on this module, AppRoot
 * never finishes evaluating, React never mounts → pure white screen.
 *
 * The exact same bug had already been fixed in bgm.ts during a prior
 * session, but the same pattern in sound.ts was missed because Bridgeless
 * mode swallows the error and shows nothing on screen.
 *
 * This linter catches the pattern at commit time using a real TypeScript
 * AST walk (not regex / brace counting). It only flags calls at module
 * top level — same code inside a function or method is fine, because it
 * runs only when called and a sensible caller will guard it.
 *
 * Usage:
 *   node scripts/lint-rn-safety.mjs <files...>     # explicit files
 *   node scripts/lint-rn-safety.mjs                # scan packages/app/{src,app}/**\/*.{ts,tsx}
 *
 * Exit code 0 = clean, 1 = at least one violation.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');

// ─────────────────────────────────────────────────────────────────────
// Dangerous patterns: function calls that exist on web but throw / are
// undefined on React Native. Each entry is `<receiver>.<method>` —
// we check the call expression's left side.
// ─────────────────────────────────────────────────────────────────────

const DANGEROUS_CALLS = new Set([
  // DOM event listeners — the canonical bgm.ts/sound.ts trap
  'window.addEventListener',
  'window.removeEventListener',
  'document.addEventListener',
  'document.removeEventListener',

  // DOM queries — RN has no document
  'document.querySelector',
  'document.querySelectorAll',
  'document.getElementById',
  'document.getElementsByClassName',
  'document.getElementsByTagName',
  'document.createElement',

  // Storage — RN has neither localStorage nor sessionStorage
  'localStorage.getItem',
  'localStorage.setItem',
  'localStorage.removeItem',
  'localStorage.clear',
  'sessionStorage.getItem',
  'sessionStorage.setItem',
  'sessionStorage.removeItem',
  'sessionStorage.clear',

  // Speech synthesis
  'window.speechSynthesis.speak',
  'window.speechSynthesis.cancel',
  'window.speechSynthesis.getVoices',
  'speechSynthesis.speak',
  'speechSynthesis.cancel',
  'speechSynthesis.getVoices',

  // Geolocation / clipboard / etc — extend as needed
  'navigator.geolocation.getCurrentPosition',
  'navigator.clipboard.writeText',
  'navigator.clipboard.readText',
]);

// `new X()` patterns — same idea
const DANGEROUS_NEWS = new Set([
  'AudioContext',
  'webkitAudioContext',
  'SpeechSynthesisUtterance',
  'WebSocket',  // RN has its own WebSocket; constructing the global is OK actually, but flag for review
  'XMLHttpRequest', // RN has fetch; XHR exists but is awkward
]);

// Receiver dotted-name we care about (left side of access)
function dottedName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const left = dottedName(node.expression);
    if (!left) return null;
    return `${left}.${node.name.text}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Lint one file
// ─────────────────────────────────────────────────────────────────────

// Check whether a call is "guarded" by an enclosing if statement whose
// condition does a `typeof <thing>.<method> === 'function'` check (or the
// looser `typeof <method> === 'function'`) for the specific method being
// called. This is the pattern we use in bgm.ts / sound.ts after the fix:
//
//   if (
//     typeof window !== 'undefined' &&
//     typeof window.addEventListener === 'function'
//   ) {
//     window.addEventListener(...);     // ← safe
//   }
function isGuarded(callNode, methodName, enclosingIfConditions) {
  for (const cond of enclosingIfConditions) {
    // The condition's text must mention `typeof` AND the specific method
    // we're calling AND `'function'` somewhere. That's a strong enough
    // proxy for an actual function-existence check without doing full
    // semantic analysis.
    if (
      cond.includes('typeof') &&
      cond.includes(methodName) &&
      cond.includes("'function'")
    ) {
      return true;
    }
  }
  return false;
}

function lintFile(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true);
  const violations = [];

  // Walk the AST. Track:
  //   depth                  — function-body nesting (top-level = 0)
  //   enclosingIfConditions  — text of every `if (...)` whose then/else
  //                            block currently contains us
  function visit(node, depth, enclosingIfConditions) {
    // Top-level dangerous call?
    if (depth === 0 && ts.isCallExpression(node)) {
      const callee = dottedName(node.expression);
      if (callee && DANGEROUS_CALLS.has(callee)) {
        // Last segment of the dotted name is the method (e.g. addEventListener)
        const method = callee.split('.').pop();
        if (!isGuarded(node, method, enclosingIfConditions)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart());
          violations.push({
            file: absPath,
            line: pos.line + 1,
            col: pos.character + 1,
            rule: 'top-level-web-api-call',
            message: `\`${callee}(...)\` is undefined on React Native and will throw at module load. Move it inside a function, or guard with \`typeof ${callee} === 'function'\`.`,
            snippet: source.split('\n')[pos.line]?.trim().slice(0, 120),
          });
        }
      }
    }
    if (depth === 0 && ts.isNewExpression(node)) {
      const ctor = node.expression;
      if (ts.isIdentifier(ctor) && DANGEROUS_NEWS.has(ctor.text)) {
        if (!isGuarded(node, ctor.text, enclosingIfConditions)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart());
          violations.push({
            file: absPath,
            line: pos.line + 1,
            col: pos.character + 1,
            rule: 'top-level-web-constructor',
            message: `\`new ${ctor.text}()\` is undefined on React Native at module load. Move it inside a function (lazy init).`,
            snippet: source.split('\n')[pos.line]?.trim().slice(0, 120),
          });
        }
      }
    }

    // Function-body entry → +1 depth
    const enters =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node);

    const childDepth = enters ? depth + 1 : depth;

    // If statement → push its condition for the children of its then/else
    if (ts.isIfStatement(node)) {
      const condText = node.expression.getText(sf);
      const childIfs = [...enclosingIfConditions, condText];
      visit(node.expression, childDepth, enclosingIfConditions); // condition is not under the guard itself
      visit(node.thenStatement, childDepth, childIfs);
      if (node.elseStatement) visit(node.elseStatement, childDepth, childIfs);
      return;
    }

    ts.forEachChild(node, (c) => visit(c, childDepth, enclosingIfConditions));
  }

  visit(sf, 0, []);
  return violations;
}

// ─────────────────────────────────────────────────────────────────────
// Resolve files to scan
// ─────────────────────────────────────────────────────────────────────

function gatherFiles(args) {
  if (args.length > 0) {
    return args.map((p) => resolve(process.cwd(), p)).filter((p) => {
      try {
        return statSync(p).isFile() && /\.tsx?$/.test(p);
      } catch {
        return false;
      }
    });
  }

  // Default scope: packages/app/{src,app}/**/*.{ts,tsx}
  // Use git ls-files to be fast and respect gitignore
  const repoRoot = findRepoRoot();
  const result = spawnSync(
    'git',
    ['ls-files', '--', 'packages/app/src/*.ts', 'packages/app/src/*.tsx', 'packages/app/src/**/*.ts', 'packages/app/src/**/*.tsx', 'packages/app/app/*.ts', 'packages/app/app/*.tsx', 'packages/app/app/**/*.ts', 'packages/app/app/**/*.tsx'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((rel) => join(repoRoot, rel));
}

function findRepoRoot() {
  let dir = APP_ROOT;
  for (let i = 0; i < 8; i++) {
    try {
      if (statSync(join(dir, '.git')).isDirectory()) return dir;
    } catch { /* noop */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return APP_ROOT;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const files = gatherFiles(args);

if (files.length === 0) {
  console.log('lint-rn-safety: no files to scan.');
  process.exit(0);
}

const allViolations = [];
for (const f of files) {
  try {
    allViolations.push(...lintFile(f));
  } catch (e) {
    console.error(`lint-rn-safety: failed to parse ${f}:`, e.message);
  }
}

if (allViolations.length === 0) {
  console.log(`lint-rn-safety: ${files.length} file(s) scanned, 0 violations.`);
  process.exit(0);
}

const c = { red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m', cyan: '\x1b[36m', reset: '\x1b[0m' };
const repoRoot = findRepoRoot();

console.error(`${c.red}lint-rn-safety: ${allViolations.length} violation(s)${c.reset}\n`);
for (const v of allViolations) {
  const rel = relative(repoRoot, v.file).replace(/\\/g, '/');
  console.error(`${c.cyan}${rel}:${v.line}:${v.col}${c.reset}  ${c.yellow}${v.rule}${c.reset}`);
  console.error(`  ${v.message}`);
  if (v.snippet) console.error(`  ${c.gray}> ${v.snippet}${c.reset}`);
  console.error('');
}

console.error(`${c.red}Commit blocked.${c.reset} See https://docs.expo.dev/guides/web-support/ for the RN/Web compat reference.`);
console.error('If you really need to bypass (NOT recommended): git commit --no-verify');
process.exit(1);
