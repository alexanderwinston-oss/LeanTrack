import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export function useBackHandler(handler: () => boolean, deps: any[] = []) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
