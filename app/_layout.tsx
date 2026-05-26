import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDB, getProfile } from '@/lib/db';
import { useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setProfile = useStore((s) => s.setProfile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

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
    </SafeAreaProvider>
  );
}
