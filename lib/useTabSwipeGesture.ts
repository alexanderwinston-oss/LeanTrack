import { usePathname, useRouter } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const TAB_ORDER = ['index', 'journal', 'eau', 'plan', 'profil'];
const SWIPE_THRESHOLD = 80; // min horizontal distance to trigger a tab switch
const VERTICAL_LOCK = 15; // max vertical drift before the gesture cancels itself,
// deferring to whatever vertical ScrollView is underneath

// Swipe left/right between tabs. Lives here (attached per-screen via ScreenContainer)
// rather than wrapped around the whole <Tabs> navigator in app/(tabs)/_layout.tsx — a
// GestureDetector wrapping the navigator from the outside never received touches at all
// on-device, a known issue with react-native-screens' native screen containers sitting
// between the detector and the actual touch events. Attaching the gesture inside each
// screen's own render tree (no native-screens boundary in between) is the documented
// workaround.
export function useTabSwipeGesture() {
  const router = useRouter();
  const pathname = usePathname();
  // '/' (root of the tabs group) is the dashboard; every other tab is its own path segment.
  const currentTab = (() => {
    const last = pathname.split('/').filter(Boolean).pop();
    return last && last !== '(tabs)' ? last : 'index';
  })();

  // Plain JS function, invoked via runOnJS — .onEnd() runs as a UI-thread worklet, and
  // router.navigate is a JS-thread function. Calling it directly from the worklet (as the
  // previous two attempts did) silently does nothing; this is why relocating the
  // GestureDetector alone didn't fix anything.
  function goToTab(tab: string, direction: 1 | -1) {
    const currentIndex = TAB_ORDER.indexOf(tab);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
    router.navigate(`/(tabs)/${TAB_ORDER[nextIndex]}` as any);
  }

  return Gesture.Pan()
    .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
    .failOffsetY([-VERTICAL_LOCK, VERTICAL_LOCK])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < SWIPE_THRESHOLD) return;
      if (Math.abs(e.translationY) > VERTICAL_LOCK) return;
      if (e.translationX < 0) {
        runOnJS(goToTab)(currentTab, 1);
      } else if (e.translationX > 0) {
        runOnJS(goToTab)(currentTab, -1);
      }
    });
}
