import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, SlideInDown, useAnimatedStyle, useSharedValue,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { ProgressRing } from '@/components/ProgressRing';
import { MacroBars } from '@/components/MacroBars';
import { Card } from '@/components/ui/Card';
import { MealCard } from '@/components/MealCard';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import { getStreakDays } from '@/lib/db';
import { getTodayCaloriesBurned } from '@/lib/healthConnect';
import { getLocalDateString, getProfileName } from '@/lib/utils';
import { WaterQuickAdd } from '@/components/WaterQuickAdd';
import { ScrollArrowIndicator } from '@/components/ScrollArrowIndicator';
import { useScrollFade } from '@/lib/useScrollFade';


export default function Dashboard() {
  const profile = useStore((s) => s.profile);
  const dailyTotals = useStore((s) => s.dailyTotals);
  const meals = useStore((s) => s.meals);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const caloriesBurned = useStore((s) => s.caloriesBurned);
  const healthConnectEnabled = useStore((s) => s.healthConnectEnabled);
  const setCaloriesBurned = useStore((s) => s.setCaloriesBurned);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingCalories, setSyncingCalories] = useState(false);
  const mealsFade = useScrollFade();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const today = getLocalDateString();
      refreshDailyData(today);
      getStreakDays().then((s) => {
        if (!cancelled) setStreak(s);
      });
      return () => { cancelled = true; };
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    const today = getLocalDateString();
    await refreshDailyData(today);
    setRefreshing(false);
  }

  async function handleSyncCalories() {
    setSyncingCalories(true);
    try {
      const calories = await getTodayCaloriesBurned();
      setCaloriesBurned(calories);
    } finally {
      setSyncingCalories(false);
    }
  }

  const todayLabel = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });
  const calorieTarget = profile?.calorie_target ?? 2000;
  const waterTarget = profile?.water_target ?? 2000;
  const waterProgress = Math.min(dailyTotals.water_ml / waterTarget, 1);
  const calorieRatio = calorieTarget > 0 ? dailyTotals.calories / calorieTarget : 0;
  const showCalorieBanner = calorieRatio >= 0.9 && calorieRatio <= 1.15;

  const fillWidth = useSharedValue(0);
  useEffect(() => {
    fillWidth.value = withSpring(waterProgress, { damping: 20, stiffness: 90, mass: 0.8 });
  }, [waterProgress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillWidth.value * 100}%` }));

  const syncRotation = useSharedValue(0);
  useEffect(() => {
    if (syncingCalories) {
      syncRotation.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(syncRotation);
      syncRotation.value = withTiming(0, { duration: 150 });
    }
  }, [syncingCalories]);
  const syncIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${syncRotation.value}deg` }] }));

  return (
    <ScreenContainer>
    <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour {getProfileName(profile)} 👋</Text>
            <Text style={styles.date}>{todayLabel}</Text>
          </View>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}j</Text>
            </View>
          )}
        </View>

        {/* Calorie celebration banner */}
        {showCalorieBanner && (
          <View style={styles.calorieBanner}>
            <Text style={styles.calorieBannerText}>
              🔥 Belle journée ! Tu es à {Math.round(calorieRatio * 100)}% de ton objectif
            </Text>
          </View>
        )}

        {/* Progress Ring */}
        <Animated.View entering={SlideInDown.delay(0).springify()}>
        <Card style={styles.ringCard}>
          {healthConnectEnabled && (
            <Pressable
              style={styles.syncIconBtn}
              disabled={syncingCalories}
              onPress={handleSyncCalories}
              hitSlop={8}
            >
              <Animated.Text style={[styles.syncIconText, syncIconStyle]}>↻</Animated.Text>
            </Pressable>
          )}
          <View style={styles.ringRow}>
            <ProgressRing
              consumed={dailyTotals.calories}
              target={calorieTarget}
              size={160}
            />
            <View style={styles.ringRight}>
              <MacroBars
                protein={{ consumed: dailyTotals.protein, target: profile?.protein_target ?? 150 }}
                carbs={{ consumed: dailyTotals.carbs, target: profile?.carbs_target ?? 200 }}
                fat={{ consumed: dailyTotals.fat, target: profile?.fat_target ?? 60 }}
              />
            </View>
          </View>
          {(() => {
            const adjustedTarget = (profile?.calorie_target ?? 0) + caloriesBurned;
            const remainingCalories = Math.max(
              adjustedTarget - (dailyTotals?.calories ?? 0),
              0
            );
            const isOver = (dailyTotals?.calories ?? 0) > adjustedTarget;
            const overBy = (dailyTotals?.calories ?? 0) - adjustedTarget;
            return (
              <View style={{
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: Colors.border,
              }}>
                <Text style={{
                  color: isOver ? Colors.danger : Colors.accent,
                  fontSize: 36,
                  fontWeight: '700',
                  letterSpacing: -0.5,
                }}>
                  {isOver ? `-${overBy}` : `${remainingCalories}`} kcal
                </Text>
                <Text style={{
                  color: Colors.textMuted,
                  fontSize: 12,
                  marginTop: 2,
                }}>
                  {isOver ? 'au-dessus de l\'objectif' : 'restantes aujourd\'hui'}
                </Text>
                {healthConnectEnabled && caloriesBurned > 0 && (
                  <View style={styles.burnedRow}>
                    <Text style={styles.burnedIcon}>🔥</Text>
                    <Text style={styles.burnedText}>
                      {caloriesBurned} kcal brûlées aujourd'hui
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
        </Card>
        </Animated.View>

        {/* Water bar */}
        <Animated.View entering={SlideInDown.delay(80).springify()}>
        <Card style={styles.waterCard}>
          <View style={styles.waterHeader}>
            <Text style={styles.waterLabel}>💧 Hydratation</Text>
            <Text style={styles.waterValue}>
              <Text style={{ color: Colors.waterColor }}>{dailyTotals.water_ml}</Text>
              <Text style={{ color: Colors.textSecondary }}> / {waterTarget} ml</Text>
            </Text>
          </View>
          <View style={styles.waterTrack}>
            <Animated.View style={[styles.waterFill, fillStyle]} />
          </View>
          <WaterQuickAdd quickAmounts={[150, 250, 330, 500]} />
        </Card>
        </Animated.View>

        {/* Today's meals */}
        <Text style={styles.sectionTitle}>Repas d'aujourd'hui</Text>
        {meals.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Aucun repas enregistré aujourd'hui</Text>
            <Text style={styles.emptyHint}>Appuie sur "Journal" pour ajouter tes repas</Text>
          </Card>
        ) : (
          <View style={styles.mealScrollRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.mealScroll, styles.mealScrollFlex]}
              contentContainerStyle={styles.mealScrollContent}
              contentOffset={{ x: 0, y: 0 }}
              onLayout={mealsFade.onLayout}
              onContentSizeChange={mealsFade.onContentSizeChange}
              onScroll={mealsFade.onScroll}
              scrollEventThrottle={16}
            >
              {meals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  compact
                  style={styles.mealCardItem}
                  onMealChanged={() => refreshDailyData(getLocalDateString())}
                />
              ))}
            </ScrollView>
            <View style={styles.mealArrowSlot}>
              {mealsFade.showFade && <ScrollArrowIndicator />}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/photo-analyse')}>
            <Text style={styles.actionEmoji}>📷</Text>
            <Text style={styles.actionLabel}>Analyser repas</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/projection')}>
            <Text style={styles.actionEmoji}>📊</Text>
            <Text style={styles.actionLabel}>Ma projection</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/recap-semaine')}>
            <Text style={styles.actionEmoji}>📅</Text>
            <Text style={styles.actionLabel}>Ma semaine</Text>
          </Pressable>
        </View>
        <View style={{ height: BOTTOM_SPACER_HEIGHT }} />
      </ScrollView>
    </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 12, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  streakBadge: {
    backgroundColor: Colors.accentSubtle,
    borderRadius: Colors.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  streakText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  calorieBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 12,
    alignItems: 'center',
  },
  calorieBannerText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
  ringCard: { padding: 20 },
  syncIconBtn: { position: 'absolute', top: 12, right: 12, padding: 6, zIndex: 1 },
  syncIconText: { fontSize: 16, color: Colors.accent },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringRight: { flex: 1 },
  burnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  burnedIcon: { fontSize: 13 },
  burnedText: { fontSize: 13, color: Colors.textSecondary },
  waterCard: { gap: 12 },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waterLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  waterValue: { fontSize: 14 },
  waterTrack: {
    height: 10,
    backgroundColor: Colors.trackBg,
    borderRadius: 5,
    overflow: 'hidden',
  },
  waterFill: {
    height: '100%',
    backgroundColor: Colors.waterColorLight,
    borderRadius: 5,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  emptyCard: { alignItems: 'center', gap: 4, minHeight: 70, justifyContent: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', flexShrink: 1 },
  emptyHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', flexShrink: 1 },
  mealScrollRow: { flexDirection: 'row', alignItems: 'stretch' },
  mealScroll: { marginHorizontal: -4 },
  mealScrollFlex: { flex: 1 },
  mealArrowSlot: { width: 32, alignItems: 'center', justifyContent: 'center' },
  mealScrollContent: { paddingRight: 0 },
  mealCardItem: { marginHorizontal: 4 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    minHeight: 96,
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionEmoji: { fontSize: 28 },
  actionLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', textAlign: 'center' },
});
