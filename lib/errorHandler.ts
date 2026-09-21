import { Alert } from 'react-native';

// TEMPORARY diagnostic reporting — see entry.js. Remove once the launch-crash
// root cause is found and fixed.
function reportRemote(message: string): void {
  try {
    fetch('https://ntfy.sh/leantrack-crash-2xgb456u', {
      method: 'POST',
      body: message,
      headers: { Title: 'LeanTrack crash (errorHandler)' },
    }).catch(() => {});
  } catch {}
}

// Surfaces any error that would otherwise produce a silent blank screen — both
// uncaught JS exceptions (sync or in an async callback) and unhandled promise
// rejections — as a visible Alert, even in a production/preview build with no
// dev tools attached. This is a diagnostic aid: without it, a throw outside of
// React's render (e.g. in a useEffect callback) leaves the app on a blank white
// screen with zero feedback, which is impossible to debug without a USB-attached
// device.
export function installGlobalErrorHandler(): void {
  const g = globalThis as any;

  if (g.ErrorUtils?.setGlobalHandler) {
    const defaultHandler = g.ErrorUtils.getGlobalHandler?.();
    g.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const msg = `${isFatal ? 'FATAL' : 'non-fatal'} — ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}\n\n${error?.stack ?? ''}`;
      reportRemote(msg);
      Alert.alert(
        isFatal ? '💥 Erreur fatale' : '⚠️ Erreur',
        msg.slice(0, 500),
        [{ text: 'OK' }]
      );
      defaultHandler?.(error, isFatal);
    });
  }

  const onUnhandledRejection = (event: any) => {
    const reason = event?.reason ?? event;
    const msg = `unhandledrejection — ${reason?.message ?? String(reason)}\n\n${reason?.stack ?? ''}`;
    reportRemote(msg);
    Alert.alert('⚠️ Promise rejetée', msg.slice(0, 500), [{ text: 'OK' }]);
  };
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('unhandledrejection', onUnhandledRejection);
  } else if (g.process?.on) {
    g.process.on('unhandledRejection', onUnhandledRejection);
  }
}
