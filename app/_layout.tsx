import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDB, healData, healOrphanedProfile, recoverMainProfile, migrateDefaultProfile, getProfile, getSetting, getUnlockedAchievements, checkAndUnlockAchievements } from '@/lib/db';
import { isHealthConnectAvailable, getTodayCaloriesBurned } from '@/lib/healthConnect';
import { getSupabase } from '@/lib/supabase';
import { UserProfile } from '@/lib/types';
import { useGlobalBackHandler } from '@/lib/useModalManager';
import { useStore } from '@/lib/store';
import { getLocalDateString } from '@/lib/utils';
import { installGlobalErrorHandler } from '@/lib/errorHandler';
import { Colors } from '@/constants/Colors';
import BadgeCelebration from '@/components/BadgeCelebration';
import LevelUpToast from '@/components/LevelUpToast';
import HealthConnectToast from '@/components/HealthConnectToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

installGlobalErrorHandler();
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
  const pendingHealthToast = useStore((s) => s.pendingHealthToast);
  const setPendingHealthToast = useStore((s) => s.setPendingHealthToast);
  const setUnlockedAchievementIds = useStore((s) => s.setUnlockedAchievementIds);
  const setCaloriesBurned = useStore((s) => s.setCaloriesBurned);
  const setHealthConnectEnabled = useStore((s) => s.setHealthConnectEnabled);
  const setSupabaseUser = useStore((s) => s.setSupabaseUser);

  useGlobalBackHandler();

  // Reads the persisted flag directly from SQLite rather than the store (which always
  // starts at its false default on a cold launch) — otherwise a user who connected in a
  // previous session would never get their calories synced after restarting the app.
  async function syncHealthConnect() {
    const available = await isHealthConnectAvailable();
    if (!available) return;

    const enabled = (await getSetting('health_connect_enabled')) === '1';
    setHealthConnectEnabled(enabled);
    if (!enabled) return;

    const calories = await getTodayCaloriesBurned();
    setCaloriesBurned(calories);
  }

  // Belt-and-suspenders: if startup never reaches setReady(true) for any reason
  // we didn't anticipate, don't leave the user staring at a blank screen forever —
  // force the app visible after 12s so it's at least usable, even in a degraded state.
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady((prev) => {
        if (!prev) {
          console.error('[startup] timed out waiting for startup sequence — forcing ready');
          fetch('https://ntfy.sh/leantrack-crash-2xgb456u', {
            method: 'POST',
            body: 'startup 12s timeout fired — startup sequence never reached setReady(true)',
            headers: { Title: 'LeanTrack crash (timeout)' },
          }).catch(() => {});
          SplashScreen.hideAsync().catch(() => {});
          router.replace('/login');
        }
        return true;
      });
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

  // Fires on sign-out (from anywhere in the app) and on token refresh failure —
  // both cases mean the session is gone, so bounce straight to /login.
  useEffect(() => {
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setSupabaseUser(null);
        router.replace('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      // Never let a broken session check hang the app on the splash screen forever —
      // treat any failure to read the session the same as "no session".
      let session: import('@supabase/supabase-js').Session | null = null;
      try {
        session = (await getSupabase().auth.getSession()).data.session;
      } catch (e) {
        console.error('[startup] getSession', e);
      }
      if (!session) {
        setReady(true);
        await SplashScreen.hideAsync();
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setSupabaseUser({
        id: authUser.id,
        email: authUser.email ?? null,
        avatar_url: authUser.user_metadata?.avatar_url ?? null,
      });

      try { await initDB(); } catch (e) { console.error('[startup] initDB', e); }
      try { await migrateDefaultProfile(authUser.id); } catch (e) { console.error('[startup] migrateDefaultProfile', e); }
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

      // Never blocks launch — Health Connect is optional and this fails silently on
      // its own, but the outer try/catch is a backstop against any unexpected throw.
      try {
        await syncHealthConnect();
      } catch (e) { console.error('[startup] syncHealthConnect', e); }

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
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bgPrimary },
            animation: 'slide_from_right',
            animationDuration: 220,
          }}
        >
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
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
        <HealthConnectToast
          visible={pendingHealthToast != null && badgeQueue.length === 0}
          icon={pendingHealthToast?.icon ?? ''}
          title={pendingHealthToast?.title ?? ''}
          subtitle={pendingHealthToast?.subtitle ?? ''}
          onClose={() => setPendingHealthToast(null)}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
