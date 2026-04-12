// 🩺 Earliest possible global error handler — pure CommonJS so it actually
// runs first. ES `import` would be hoisted by Metro/Babel, defeating the
// purpose. `require` runs in source order.
//
// Captures throws into `global.__earlyErrors__`. The root layout reads
// the buffer and renders an error UI if anything was captured.

(function installEarlyErrorHandler() {
  try {
    if (!global.__earlyErrors__) global.__earlyErrors__ = [];

    var ErrorUtils = global.ErrorUtils;
    if (ErrorUtils && typeof ErrorUtils.setGlobalHandler === 'function') {
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
        } catch (_) { /* swallow */ }
        if (prev) {
          try { prev(error, isFatal); } catch (_) { /* swallow */ }
        }
      });
    }
  } catch (_) { /* swallow */ }
})();

// Promise rejection hook (best-effort)
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

// Now load expo-router. Use require, not import — see comment above.
require('expo-router/entry');
