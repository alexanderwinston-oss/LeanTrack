import { usePathname, useRouter } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const TAB_ORDER = ['index', 'journal', 'eau', 'plan', 'profil'];
const SWIPE_THRESHOLD = 80; // min horizontal distance to trigger a tab switch — also the
// gesture's own activeOffsetX, so it never contests any horizontal ScrollView underneath
// (WaterQuickAdd's chips, dashboard meal row, Plan's day selector), which all claim a drag
// at their own much smaller native scroll threshold well before this fires.
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
  // router.navigate is a JS-thread function. Calling it directly from the worklet silently
  // does nothing.
  function goToTab(tab: string, direction: 1 | -1) {
    const currentIndex = TAB_ORDER.indexOf(tab);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
    const nextTab = TAB_ORDER[nextIndex];
    // index.tsx is the group's root route (/(tabs)) — "/(tabs)/index" isn't a real path.
    const path = nextTab === 'index' ? '/(tabs)' : `/(tabs)/${nextTab}`;
    router.navigate(path as any);
  }

  // The gesture can only ever start moving this (activeOffsetX gates it) once the drag is
  // already past SWIPE_THRESHOLD — a real pager would let you drag from 0px, but that would
  // mean contesting every horizontal ScrollView on the screen from the very first pixel,
  // which is exactly what this threshold exists to avoid. So this offsets translateX by the
  // activation distance, making the screen start following the finger smoothly from 0 the
  // instant the gesture wins, rather than jump-cutting by 80px the moment it activates.
  const translateX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
    .failOffsetY([-VERTICAL_LOCK, VERTICAL_LOCK])
    .onUpdate((e) => {
      const activationOffset = e.translationX > 0 ? SWIPE_THRESHOLD : -SWIPE_THRESHOLD;
      translateX.value = e.translationX - activationOffset;
    })
    .onEnd((e) => {
      const committed = Math.abs(e.translationX) >= SWIPE_THRESHOLD && Math.abs(e.translationY) <= VERTICAL_LOCK;
      if (committed) {
        if (e.translationX < 0) {
          runOnJS(goToTab)(currentTab, 1);
        } else {
          runOnJS(goToTab)(currentTab, -1);
        }
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { gesture, animatedStyle };
}
