import React, { useCallback, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { ProgressRing } from '@/components/ProgressRing';
import { MacroBars } from '@/components/MacroBars';
import { Card } from '@/components/ui/Card';
import { useStore } from '@/lib/store';
import { getStreakDays } from '@/lib/db';
import { MealType } from '@/lib/types';

const MEAL_LABELS: Record<MealType, string> = {
  petit_dejeuner: '🥣 Petit-déjeuner',
  dejeuner: '🍽️ Déjeuner',
  diner: '🌙 Dîner',
  collation: '🍎 Collation',
};

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const profile = useStore((s) => s.profile);
  const dailyTotals = useStore((s) => s.dailyTotals);
  const meals = useStore((s) => s.meals);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const addWaterToStore = useStore((s) => s.addWaterToStore);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const today = new Date().toISOString().split('T')[0];
      refreshDailyData(today);
      getStreakDays().then(setStreak);
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    const today = new Date().toISOString().split('T')[0];
    await refreshDailyData(today);
    setRefreshing(false);
  }

  const todayLabel = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });
  const calorieTarget = profile?.calorie_target ?? 2000;
  const waterTarget = profile?.water_target ?? 2000;
  const waterProgress = Math.min(dailyTotals.water_ml / waterTarget, 1);
  const calorieRatio = calorieTarget > 0 ? dailyTotals.calories / calorieTarget : 0;
  const showCalorieBanner = calorieRatio >= 0.9 && calorieRatio <= 1.15;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour {profile?.name ?? '👋'} 👋</Text>
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
        <Card style={styles.ringCard}>
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
        </Card>

        {/* Water bar */}
        <Card style={styles.waterCard}>
          <View style={styles.waterHeader}>
            <Text style={styles.waterLabel}>💧 Hydratation</Text>
            <Text style={styles.waterValue}>
              <Text style={{ color: Colors.waterColor }}>{dailyTotals.water_ml}</Text>
              <Text style={{ color: Colors.textSecondary }}> / {waterTarget} ml</Text>
            </Text>
          </View>
          <View style={styles.waterTrack}>
            <View style={[styles.waterFill, { width: `${waterProgress * 100}%` }]} />
          </View>
          <View style={styles.waterBtns}>
            {[150, 250, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={styles.waterBtn}
                onPress={() => addWaterToStore(new Date().toISOString().split('T')[0], ml)}
              >
                <Text style={styles.waterBtnText}>+{ml}ml</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Today's meals */}
        <Text style={styles.sectionTitle}>Repas d'aujourd'hui</Text>
        {meals.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Aucun repas enregistré aujourd'hui</Text>
            <Text style={styles.emptyHint}>Appuie sur "Journal" pour ajouter tes repas</Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealScroll}>
            {meals.map((meal) => (
              <Card key={meal.id} style={styles.mealCard}>
                <Text style={styles.mealType}>{MEAL_LABELS[meal.meal_type]}</Text>
                <Text style={styles.mealName} numberOfLines={2}>{meal.food_name}</Text>
                <Text style={[styles.mealCalories, { color: Colors.accent }]}>{Math.round(meal.calories)} kcal</Text>
                <Text style={styles.mealMacros}>
                  P:{Math.round(meal.protein)}g G:{Math.round(meal.carbs)}g L:{Math.round(meal.fat)}g
                </Text>
              </Card>
            ))}
          </ScrollView>
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
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
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
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringRight: { flex: 1 },
  waterCard: { gap: 12 },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waterLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  waterValue: { fontSize: 14 },
  waterTrack: {
    height: 10,
    backgroundColor: Colors.bgElevated,
    borderRadius: 5,
    overflow: 'hidden',
  },
  waterFill: {
    height: '100%',
    backgroundColor: Colors.waterColor,
    borderRadius: 5,
  },
  waterBtns: { flexDirection: 'row', gap: 10 },
  waterBtn: {
    flex: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.waterColor,
    paddingVertical: 10,
    alignItems: 'center',
  },
  waterBtnText: { color: Colors.waterColor, fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  emptyCard: { alignItems: 'center', gap: 4 },
  emptyText: { color: Colors.textSecondary, fontSize: 15 },
  emptyHint: { color: Colors.textMuted, fontSize: 13 },
  mealScroll: { marginHorizontal: -4 },
  mealCard: { width: 150, marginHorizontal: 4, gap: 6 },
  mealType: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  mealName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, lineHeight: 19 },
  mealCalories: { fontSize: 18, fontWeight: '700' },
  mealMacros: { fontSize: 11, color: Colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionEmoji: { fontSize: 28 },
  actionLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', textAlign: 'center' },
});
