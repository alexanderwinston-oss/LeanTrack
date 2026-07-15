import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDB, healData, healOrphanedProfile, recoverMainProfile, getProfile, getUnlockedAchievements, checkAndUnlockAchievements } from '@/lib/db';
import { UserProfile } from '@/lib/types';
import { useGlobalBackHandler } from '@/lib/useModalManager';
import { useStore } from '@/lib/store';
import { getLocalDateString } from '@/lib/utils';
import { Colors } from '@/constants/Colors';
import BadgeCelebration from '@/components/BadgeCelebration';
import LevelUpToast from '@/components/LevelUpToast';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setProfile = useStore((s) => s.setProfile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const badgeQueue = useStore((s) => s.badgeQueue);
  const dequeueNextBadge = useStore((s) => s.dequeueNextBadge);
  const setPendingBadge = useStore((s) => s.setPendingBadge);
  const pendingLevelUp = useStore((s) => s.pendingLevelUp);
  const setPendingLevelUp = useStore((s) => s.setPendingLevelUp);
  const setUnlockedAchievementIds = useStore((s) => s.setUnlockedAchievementIds);

  useGlobalBackHandler();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try { await initDB(); } catch (e) { console.error('[startup] initDB', e); }
      try { await recoverMainProfile(); } catch (e) { console.error('[startup] recoverMainProfile', e); }
      try { await healData(); } catch (e) { console.error('[startup] healData', e); }
      try { await healOrphanedProfile(); } catch (e) { console.error('[startup] healOrphanedProfile', e); }

      let profile: UserProfile | null = null;
      try {
        profile = await getProfile();
        if (profile) setProfile(profile);
      } catch (e) { console.error('[startup] getProfile', e); }

      try {
        if (profile) await refreshDailyData(getLocalDateString());
      } catch (e) { console.error('[startup] refreshDailyData', e); }

      if (profile) {
        // Silent on launch — never trigger the level-up toast for XP earned while offline,
        // only badge celebrations (existing behavior) and the feature-gate state get updated.
        // Awaited (unlike other steps this used to be a fire-and-forget chain) so
        // unlockedAchievementIds is hydrated before the app becomes interactive — otherwise
        // the first achievement check of the session reads an empty prevIds and can never
        // detect a level-up.
        try {
          const newOnes = await checkAndUnlockAchievements(profile);
          newOnes.forEach((b) => setPendingBadge(b));
          const ids = await getUnlockedAchievements();
          setUnlockedAchievementIds(ids);
        } catch (e) { console.error('[startup] checkAndUnlockAchievements', e); }
      }

      setReady(true);
      await SplashScreen.hideAsync();
      if (!profile || !profile.onboarding_completed) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    })();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bgPrimary },
            animation: 'fade_from_bottom',
            animationDuration: 250,
          }}
        >
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="photo-analyse" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="projection" />
          <Stack.Screen name="recap-semaine" />
          <Stack.Screen name="profiles" />
          <Stack.Screen name="recettes" />
        </Stack>
        <BadgeCelebration badge={badgeQueue[0] ?? null} onClose={dequeueNextBadge} />
        <LevelUpToast level={pendingLevelUp} onClose={() => setPendingLevelUp(null)} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
