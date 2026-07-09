import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
import { router, useFocusEffect } from 'expo-router';
import { addWeeks, endOfWeek, format, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLine } from 'victory-native';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { getWeeklyData } from '@/lib/db';
import { useStore } from '@/lib/store';
import { DailyEntry } from '@/lib/types';
import { CALORIE_TARGET_MAX_RATIO, CALORIE_TARGET_MIN_RATIO, getLocalDateString } from '@/lib/utils';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getWeekBounds(offset: number): { start: string; end: string; weekStart: Date; weekEnd: Date } {
  const todayLocal = new Date(getLocalDateString() + 'T00:00:00');
  const base = addWeeks(todayLocal, offset);
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
  return { start: getLocalDateString(weekStart), end: getLocalDateString(weekEnd), weekStart, weekEnd };
}

function barColor(calories: number, target: number): string {
  if (calories === 0) return Colors.border;
  const ratio = calories / target;
  if (ratio >= CALORIE_TARGET_MIN_RATIO && ratio <= CALORIE_TARGET_MAX_RATIO) return Colors.accent;
  if (ratio < CALORIE_TARGET_MIN_RATIO) return Colors.info;
  return Colors.danger;
}

export default function RecapSemaine() {
  const profile = useStore((s) => s.profile);
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const calorieTarget = profile?.calorie_target ?? 2000;
  const proteinTarget = profile?.protein_target ?? 150;
  const carbsTarget = profile?.carbs_target ?? 250;
  const fatTarget = profile?.fat_target ?? 70;
  const waterTarget = profile?.water_target ?? 2000;

  const bounds = getWeekBounds(weekOffset);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getWeeklyData(bounds.start, bounds.end);
      setData(rows);
    } finally {
      setLoading(false);
    }
  }, [bounds.start, bounds.end]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeDays = data.filter((d) => d.total_calories > 0);
  const avgCalories = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.total_calories, 0) / activeDays.length)
    : 0;
  const avgWater = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.water_ml, 0) / activeDays.length)
    : 0;
  const avgProtein = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.total_protein, 0) / activeDays.length)
    : 0;
  const avgCarbs = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.total_carbs, 0) / activeDays.length)
    : 0;
  const avgFat = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.total_fat, 0) / activeDays.length)
    : 0;
  const goalDays = data.filter(
    (d) =>
      d.total_calories > 0 &&
      d.total_calories >= calorieTarget * CALORIE_TARGET_MIN_RATIO &&
      d.total_calories <= calorieTarget * CALORIE_TARGET_MAX_RATIO
  ).length;

  const bestDay = activeDays.reduce<DailyEntry | null>((best, d) => {
    if (!best) return d;
    return Math.abs(d.total_calories - calorieTarget) < Math.abs(best.total_calories - calorieTarget) ? d : best;
  }, null);

  const worstDay = activeDays.reduce<DailyEntry | null>((worst, d) => {
    if (!worst) return d;
    return Math.abs(d.total_calories - calorieTarget) > Math.abs(worst.total_calories - calorieTarget) ? d : worst;
  }, null);

  const chartData = data.map((d, i) => ({
    x: i + 1,
    y: Math.round(d.total_calories),
    fill: barColor(d.total_calories, calorieTarget),
  }));

  function dayLabel(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📅 Récap de la semaine</Text>
      </View>

      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setWeekOffset((o) => o - 1)}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.weekLabel}>
            {format(bounds.weekStart, 'dd MMM', { locale: fr })} – {format(bounds.weekEnd, 'dd MMM yyyy', { locale: fr })}
          </Text>
          {weekOffset === 0 && <Text style={styles.weekLabelSub}>(cette semaine)</Text>}
        </View>
        <TouchableOpacity
          style={[styles.navBtn, weekOffset >= 0 && styles.navBtnDisabled]}
          onPress={() => weekOffset < 0 && setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
        >
          <Text style={[styles.navBtnText, weekOffset >= 0 && styles.navBtnTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : (
        <>
          <Card style={styles.chartCard}>
            <Text style={styles.cardTitle}>Calories par jour</Text>
            <Text style={styles.cardSub}>Objectif : {calorieTarget} kcal/jour</Text>
            <View style={{ width: SCREEN_W - 32, overflow: 'hidden', alignSelf: 'center' }}>
              <VictoryChart
                width={SCREEN_W - 48}
                height={200}
                domainPadding={{ x: 20 }}
                padding={{ top: 10, bottom: 40, left: 50, right: 20 }}
              >
                <VictoryAxis
                  tickValues={[1, 2, 3, 4, 5, 6, 7]}
                  tickFormat={(t: number) => DAY_LABELS[t - 1] ?? ''}
                  style={{
                    axis: { stroke: Colors.border },
                    tickLabels: { fill: Colors.textSecondary, fontSize: 11 },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: Colors.border },
                    tickLabels: { fill: Colors.textSecondary, fontSize: 10 },
                    grid: { stroke: Colors.border, strokeDasharray: '4,4' },
                  }}
                />
                <VictoryLine
                  data={[{ x: 0.5, y: calorieTarget }, { x: 7.5, y: calorieTarget }]}
                  style={{ data: { stroke: Colors.warning, strokeWidth: 1.5 } }}
                />
                <VictoryBar
                  data={chartData}
                  style={{ data: { fill: ({ datum }: any) => datum.fill as string, width: 28 } }}
                  cornerRadius={{ top: 4 }}
                />
              </VictoryChart>
            </View>
            <View style={styles.legend}>
              {[
                { color: Colors.accent, label: 'Dans l\'objectif' },
                { color: Colors.info, label: 'En dessous' },
                { color: Colors.danger, label: 'Au-dessus' },
                { color: Colors.warning, label: 'Objectif' },
              ].map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendText}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>

          <View style={styles.statGrid}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{activeDays.length}</Text>
              <Text style={styles.statLabel}>Jours loggés</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>{avgCalories}</Text>
              <Text style={styles.statLabel}>Moy. kcal/jour</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.waterColor }]}>{avgWater}</Text>
              <Text style={styles.statLabel}>Moy. eau/jour</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>
                {goalDays} / {activeDays.length}
              </Text>
              <Text style={styles.statLabel}>Jours objectif</Text>
            </Card>
          </View>

          {bestDay && (
            <View style={styles.bestWorstRow}>
              <Card style={StyleSheet.flatten([styles.statCard, { flex: 1 }]) as ViewStyle}>
                <Text style={styles.cardTitle}>🏆 Meilleur jour</Text>
                <Text style={styles.bestDayText}>{dayLabel(bestDay.date)}</Text>
                <Text style={styles.bestDayCal}>{Math.round(bestDay.total_calories)} kcal</Text>
              </Card>
              {worstDay && worstDay.date !== bestDay.date && (
                <Card style={StyleSheet.flatten([styles.statCard, { flex: 1 }]) as ViewStyle}>
                  <Text style={styles.cardTitle}>📈 À améliorer</Text>
                  <Text style={styles.bestDayText}>{dayLabel(worstDay.date)}</Text>
                  <Text style={[styles.bestDayCal, { color: Colors.warning }]}>
                    {Math.round(worstDay.total_calories)} kcal
                  </Text>
                </Card>
              )}
            </View>
          )}

          {activeDays.length > 0 && (
            <Card style={styles.macroCard}>
              <Text style={styles.cardTitle}>Macros moyennes / jour</Text>
              {[
                { label: 'Protéines', value: avgProtein, target: proteinTarget, color: Colors.proteinColor },
                { label: 'Glucides', value: avgCarbs, target: carbsTarget, color: Colors.carbsColor },
                { label: 'Lipides', value: avgFat, target: fatTarget, color: Colors.fatColor },
              ].map((macro) => (
                <View key={macro.label} style={styles.macroRow}>
                  <View style={styles.macroLabelRow}>
                    <Text style={styles.macroLabel}>{macro.label}</Text>
                    <Text style={[styles.macroValue, { color: macro.color }]}>
                      {macro.value}g / {macro.target}g
                    </Text>
                  </View>
                  <View style={styles.macroTrack}>
                    <View
                      style={[
                        styles.macroFill,
                        {
                          width: `${Math.min((macro.value / macro.target) * 100, 100)}%`,
                          backgroundColor: macro.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card style={styles.detailCard}>
            <Text style={styles.cardTitle}>Détail journalier</Text>
            {data.map((d, i) => (
              <View key={d.date} style={[styles.dayRow, i < data.length - 1 && styles.dayRowBorder]}>
                <Text style={styles.dayName}>{DAY_LABELS[i]}</Text>
                {d.total_calories > 0 ? (
                  <>
                    <Text style={[styles.dayCal, { color: barColor(d.total_calories, calorieTarget) }]}>
                      {Math.round(d.total_calories)} kcal
                    </Text>
                    <Text style={styles.dayMacros}>
                      P:{Math.round(d.total_protein)}g G:{Math.round(d.total_carbs)}g L:{Math.round(d.total_fat)}g
                    </Text>
                  </>
                ) : (
                  <Text style={styles.dayEmpty}>Aucun log</Text>
                )}
              </View>
            ))}
          </Card>

          {activeDays.length === 0 && (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Aucune donnée pour cette semaine.{'\n'}Commence à logger tes repas !
              </Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 40 },
  header: { gap: 8 },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgSurface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 22, color: Colors.textPrimary, lineHeight: 28 },
  navBtnTextDisabled: { color: Colors.textMuted },
  weekLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  weekLabelSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  loadingBox: { height: 200, alignItems: 'center', justifyContent: 'center' },
  chartCard: { gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardSub: { fontSize: 12, color: Colors.textMuted },
  legend: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '45%', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  bestWorstRow: { flexDirection: 'row', gap: 10 },
  bestDayText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },
  bestDayCal: { color: Colors.accent, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  macroCard: { gap: 12 },
  macroRow: { gap: 6 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroLabel: { fontSize: 13, color: Colors.textSecondary },
  macroValue: { fontSize: 13, fontWeight: '600' },
  macroTrack: { height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: 6, borderRadius: 3 },
  detailCard: { gap: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayName: { width: 36, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  dayCal: { fontSize: 13, fontWeight: '700', minWidth: 90 },
  dayMacros: { flex: 1, fontSize: 11, color: Colors.textMuted },
  dayEmpty: { flex: 1, fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  emptyCard: { alignItems: 'center', padding: 10 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
