// 🩺 Earliest possible global error handler.
// This runs before `expo-router/entry`, before any of our src/* code is
// loaded. If anything throws during JS bundle evaluation or module load,
// the error lands in `global.__earlyErrors__` and ErrorBoundary reads it
// when it finally mounts (if it mounts).
//
// This is the only reliable place to install the handler. ES module
// `import` statements are hoisted, so trying to install in _layout.tsx
// or src/utils/globalErrorCapture.ts happens *after* all sibling
// imports have already been evaluated and possibly thrown.
(function installEarlyErrorHandler() {
  try {
    // Expose a ring buffer ASAP so nothing has a chance to clobber it.
    if (!global.__earlyErrors__) global.__earlyErrors__ = [];

    // ErrorUtils is the RN internal global error hook. On Hermes it's
    // available as `global.ErrorUtils`.
    var ErrorUtils = global.ErrorUtils;
    if (!ErrorUtils || typeof ErrorUtils.setGlobalHandler !== 'function') return;

    var prev = typeof ErrorUtils.getGlobalHandler === 'function'
      ? ErrorUtils.getGlobalHandler()
      : null;

    ErrorUtils.setGlobalHandler(function (error, isFatal) {
      try {
        global.__earlyErrors__.push({
          message: (error && error.message) ? String(error.message) : String(error),
          stack: (error && error.stack) ? String(error.stack) : '(no stack)',
          fatal: !!isFatal,
          at: Date.now(),
        });
        if (typeof console !== 'undefined' && console.error) {
          console.error('[EARLY-CATCH]', error && error.message, error && error.stack);
        }
      } catch (_) { /* swallow */ }
      if (prev) {
        try { prev(error, isFatal); } catch (_) { /* swallow */ }
      }
    });
  } catch (_) { /* swallow */ }
})();

// Promise rejection hook (optional, but helps catch async load failures)
try {
  if (global && typeof global.addEventListener === 'function') {
    global.addEventListener('unhandledrejection', function (ev) {
      try {
        var reason = ev && ev.reason;
        global.__earlyErrors__.push({
          message: '[unhandledrejection] ' + ((reason && reason.message) || String(reason)),
          stack: (reason && reason.stack) || '(no stack)',
          fatal: false,
          at: Date.now(),
        });
      } catch (_) { /* swallow */ }
    });
  }
} catch (_) { /* swallow */ }

// Now hand off to expo-router (this is what used to be the whole file).
import 'expo-router/entry';
