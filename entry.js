// Custom entry point — TEMPORARY diagnostic wrapper around expo-router's own
// entry. If anything throws during the entire app's module-load phase
// (any import, anywhere, transitively), this is the earliest possible point
// a try/catch can intercept it — earlier than any code inside app/_layout.tsx,
// since that file's own imports must all resolve before its body ever runs.
// On catch, reports the real error to a public, no-setup webhook (ntfy.sh) so
// it's visible without USB debugging / developer mode on the device.
// Remove this file and restore "main": "expo-router/entry" in package.json
// once the root cause is found.

function report(message) {
  try {
    fetch('https://ntfy.sh/leantrack-crash-2xgb456u', {
      method: 'POST',
      body: message,
      headers: { Title: 'LeanTrack crash' },
    }).catch(() => {});
  } catch (e) {
    // fetch itself unavailable this early — nothing more we can do
  }
}

try {
  require('expo-router/entry');
} catch (e) {
  const msg = `${e && e.name}: ${e && e.message}\n\n${e && e.stack}`;
  report(msg);
  throw e;
}
