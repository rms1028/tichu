/**
 * sentry.ts — production crash reporting wrapper.
 *
 * Why this file exists instead of calling `Sentry.captureException` directly
 * everywhere:
 *   - Initialization is centralized (DSN missing → silent no-op, not crash)
 *   - Dev builds are never reported (`enabled: !__DEV__`) so we don't spam
 *     the free-tier 5,000 event/month quota while developing
 *   - `tracesSampleRate: 0.1` ← 10% performance sampling, also quota guard
 *   - beforeSend filters cookies / auth tokens so we don't leak secrets
 *     into the Sentry dashboard
 *
 * Env var: EXPO_PUBLIC_SENTRY_DSN (must be EXPO_PUBLIC_ prefixed so Expo
 * bundles it into the client at build time).
 */

import * as Sentry from '@sentry/react-native';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // Not a failure — Sentry is optional for local dev without a DSN.
    // eslint-disable-next-line no-console
    console.log('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set, skipping init');
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Dev builds: don't send to the dashboard. Errors still surface via
    // the existing early-error-handler + LogBox in dev.
    enabled: !__DEV__,
    // 10% transaction sampling — keeps us comfortably under the free
    // plan's monthly quota even with a few hundred concurrent players.
    tracesSampleRate: 0.1,
    // Strip obviously sensitive fields before events leave the device.
    beforeSend(event) {
      try {
        if (event.request?.cookies) delete event.request.cookies;
        // The app sends nothing via Authorization headers, but be safe.
        if (event.request?.headers) {
          for (const k of Object.keys(event.request.headers)) {
            if (/auth|token|cookie/i.test(k)) delete event.request.headers[k];
          }
        }
      } catch {
        /* noop */
      }
      return event;
    },
    attachStacktrace: true,
    // RN + new-arch crash symbolication.
    enableNative: true,
    enableNativeCrashHandling: true,
  });

  initialized = true;
  // eslint-disable-next-line no-console
  console.log('[Sentry] initialized');
}

/** Identify the current user (call on login). */
export function setSentryUser(playerId: string, nickname: string): void {
  if (!initialized) return;
  try {
    Sentry.setUser({ id: playerId, username: nickname });
  } catch {
    /* noop */
  }
}

/** Clear the identified user (call on logout). */
export function clearSentryUser(): void {
  if (!initialized) return;
  try {
    Sentry.setUser(null);
  } catch {
    /* noop */
  }
}

/**
 * Manual error report — use inside try/catch for handled errors.
 * Unhandled errors are already captured by the native crash handler.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] reportError (dev, not sent):', error, context);
    return;
  }
  if (!initialized) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* noop */
  }
}

/**
 * Breadcrumb — lightweight timeline entry showing user journey before
 * a crash. Call at key user-action boundaries: login, room join/leave,
 * game start/end, card play, error toast display.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    Sentry.addBreadcrumb({
      message,
      category,
      level: 'info',
      data,
    });
  } catch {
    /* noop */
  }
}
