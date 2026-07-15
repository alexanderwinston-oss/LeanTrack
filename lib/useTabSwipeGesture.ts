import { usePathname, useRouter } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';

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

  return Gesture.Pan()
    .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
    .failOffsetY([-VERTICAL_LOCK, VERTICAL_LOCK])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < SWIPE_THRESHOLD) return;
      if (Math.abs(e.translationY) > VERTICAL_LOCK) return;
      const currentIndex = TAB_ORDER.indexOf(currentTab);
      if (currentIndex === -1) return;
      if (e.translationX < 0 && currentIndex < TAB_ORDER.length - 1) {
        router.navigate(`/(tabs)/${TAB_ORDER[currentIndex + 1]}` as any);
      } else if (e.translationX > 0 && currentIndex > 0) {
        router.navigate(`/(tabs)/${TAB_ORDER[currentIndex - 1]}` as any);
      }
    });
}
