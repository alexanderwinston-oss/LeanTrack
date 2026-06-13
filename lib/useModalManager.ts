import { useEffect } from 'react';
import { BackHandler } from 'react-native';

type ModalEntry = { visible: boolean; close: () => void; priority: number };
const registry = new Map<string, ModalEntry>();

export function registerModal(
  id: string,
  visible: boolean,
  close: () => void,
  priority = 0
) {
  useEffect(() => {
    if (visible) {
      registry.set(id, { visible, close, priority });
    } else {
      registry.delete(id);
    }
    return () => { registry.delete(id); };
  }, [visible]);
}

export function useGlobalBackHandler() {
  useEffect(() => {
    const handler = () => {
      const sorted = [...registry.values()]
        .filter(e => e.visible)
        .sort((a, b) => b.priority - a.priority);
      if (sorted.length > 0) {
        sorted[0].close();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, []);
}
