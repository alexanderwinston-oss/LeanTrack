import { Alert } from 'react-native';

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
      Alert.alert(
        isFatal ? '💥 Erreur fatale' : '⚠️ Erreur',
        `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}\n\n${(error?.stack ?? '').slice(0, 500)}`,
        [{ text: 'OK' }]
      );
      defaultHandler?.(error, isFatal);
    });
  }

  const onUnhandledRejection = (event: any) => {
    const reason = event?.reason ?? event;
    Alert.alert(
      '⚠️ Promise rejetée',
      `${reason?.message ?? String(reason)}\n\n${(reason?.stack ?? '').slice(0, 500)}`,
      [{ text: 'OK' }]
    );
  };
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('unhandledrejection', onUnhandledRejection);
  } else if (g.process?.on) {
    g.process.on('unhandledRejection', onUnhandledRejection);
  }
}
