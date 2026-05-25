import * as SplashScreen from 'expo-splash-screen';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { initDB, getProfile } from '@/lib/db';
import { useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setProfile = useStore((s) => s.setProfile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);

  useEffect(() => {
    (async () => {
      try {
        await initDB();
        const profile = await getProfile();
        if (profile) {
          setProfile(profile);
          const today = new Date().toISOString().split('T')[0];
          await refreshDailyData(today);
        }
        setReady(true);
        await SplashScreen.hideAsync();
        if (!profile || !profile.onboarding_completed) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)');
        }
      } catch (e) {
        console.error('Init error', e);
        setReady(true);
        await SplashScreen.hideAsync();
      }
    })();
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="photo-analyse" options={{ presentation: 'modal' }} />
        <Stack.Screen name="projection" />
      </Stack>
    </>
  );
}
