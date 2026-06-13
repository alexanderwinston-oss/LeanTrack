import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDB, healData, getProfile, checkAndUnlockAchievements } from '@/lib/db';
import { UserProfile } from '@/lib/types';
import { useGlobalBackHandler } from '@/lib/useModalManager';
import { useStore } from '@/lib/store';
import { getLocalDateString } from '@/lib/utils';
import BadgeCelebration from '@/components/BadgeCelebration';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setProfile = useStore((s) => s.setProfile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const badgeQueue = useStore((s) => s.badgeQueue);
  const dequeueNextBadge = useStore((s) => s.dequeueNextBadge);
  const setPendingBadge = useStore((s) => s.setPendingBadge);

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
      try { await healData(); } catch (e) { console.error('[startup] healData', e); }

      let profile: UserProfile | null = null;
      try {
        profile = await getProfile();
        if (profile) setProfile(profile);
      } catch (e) { console.error('[startup] getProfile', e); }

      try {
        if (profile) await refreshDailyData(getLocalDateString());
      } catch (e) { console.error('[startup] refreshDailyData', e); }

      if (profile) {
        checkAndUnlockAchievements(profile)
          .then((newOnes) => newOnes.forEach((b) => setPendingBadge(b)))
          .catch(() => {});
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
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="photo-analyse" options={{ presentation: 'modal' }} />
        <Stack.Screen name="projection" />
        <Stack.Screen name="recap-semaine" />
        <Stack.Screen name="profiles" />
        <Stack.Screen name="recettes" />
      </Stack>
      <BadgeCelebration badge={badgeQueue[0] ?? null} onClose={dequeueNextBadge} />
    </SafeAreaProvider>
  );
}
