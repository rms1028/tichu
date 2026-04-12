/**
 * 글로벌 에러 캡처 — React 외부 / 모듈 load 단계에서 발생한 에러를 잡는다.
 *
 * 흰 화면 디버깅 용도. 일반 React 에러는 ErrorBoundary 가 잡지만,
 * 모듈 import 단계나 native 모듈 init 단계 에러는 ErrorBoundary 가 못 잡는다.
 *
 * 이 모듈은 가능한 한 의존성 없이, 다른 어떤 모듈보다 먼저 import 되어야 한다.
 */

interface CapturedError {
  message: string;
  stack: string;
  source: 'global' | 'unhandled-promise' | 'manual';
  at: number;
}

const buffer: CapturedError[] = [];
const MAX = 20;

function push(e: CapturedError) {
  buffer.push(e);
  if (buffer.length > MAX) buffer.shift();
}

export function captureManual(error: unknown, label = 'manual') {
  const err = error instanceof Error ? error : new Error(String(error));
  push({
    message: `[${label}] ${err.message}`,
    stack: err.stack ?? '(no stack)',
    source: 'manual',
    at: Date.now(),
  });
}

export function getCapturedErrors(): CapturedError[] {
  return buffer.slice();
}

export function hasCapturedErrors(): boolean {
  return buffer.length > 0;
}

let installed = false;

export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  // React Native ErrorUtils — 글로벌 JS 에러 핸들러
  try {
    const RN: any = require('react-native');
    const ErrorUtils = (RN && RN.ErrorUtils) || (global as any).ErrorUtils;
    if (ErrorUtils && typeof ErrorUtils.setGlobalHandler === 'function') {
      const prev = ErrorUtils.getGlobalHandler ? ErrorUtils.getGlobalHandler() : null;
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        push({
          message: `[global${isFatal ? '/fatal' : ''}] ${error?.message ?? String(error)}`,
          stack: error?.stack ?? '(no stack)',
          source: 'global',
          at: Date.now(),
        });
        if (prev) {
          try { prev(error, isFatal); } catch { /* swallow */ }
        }
      });
    }
  } catch {
    // RN 모듈 자체가 없으면 무시 (웹 등)
  }

  // Promise rejection 캐치
  try {
    const g: any = global;
    if (g && typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (ev: any) => {
        const reason = ev?.reason;
        const err = reason instanceof Error ? reason : new Error(String(reason));
        push({
          message: `[unhandledrejection] ${err.message}`,
          stack: err.stack ?? '(no stack)',
          source: 'unhandled-promise',
          at: Date.now(),
        });
      });
    }
  } catch { /* swallow */ }
}
