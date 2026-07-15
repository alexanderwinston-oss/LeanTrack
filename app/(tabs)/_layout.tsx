import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

const TAB_ORDER = ['index', 'journal', 'eau', 'plan', 'profil'];
const SWIPE_THRESHOLD = 80; // min horizontal distance to trigger a tab switch
const VERTICAL_LOCK = 15; // max vertical drift before the gesture cancels itself,
// deferring to whatever vertical ScrollView is underneath

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  // useSegments() at this layout's own location is typed as a 1-tuple by expo-router's
  // typed routes (it doesn't statically expose the active child route from here), so
  // segments[1] is a real type error, not just an empty-at-runtime case — usePathname()
  // sidesteps that. '/' (or '/index') is the dashboard; every other tab is its own path.
  const currentTab = (() => {
    const last = pathname.split('/').filter(Boolean).pop();
    return last && last !== '(tabs)' ? last : 'index';
  })();

  // activeOffsetX only lets this gesture activate once the drag crosses ±80px
  // horizontally; any horizontal ScrollView underneath (WaterQuickAdd's chip row, the
  // dashboard's meal row, Plan's day selector) claims the touch well before that, at its
  // own much smaller native scroll threshold, so this never fires mid-scroll. failOffsetY
  // cancels the gesture outright if the drag goes vertical first, so it never fights a
  // vertical ScrollView either.
  const swipeGesture = Gesture.Pan()
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

  return (
    <GestureDetector gesture={swipeGesture}>
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarStyle: {
          height: 55 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 5,
          backgroundColor: Colors.bgSurface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="eau"
        options={{
          title: 'Eau',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💧" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
      {/* Hide any stale route files from appearing as tabs */}
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
    </GestureDetector>
  );
}
