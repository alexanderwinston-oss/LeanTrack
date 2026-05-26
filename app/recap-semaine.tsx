import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory-native';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { getWeeklyData } from '@/lib/db';
import { useStore } from '@/lib/store';
import { DailyEntry } from '@/lib/types';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getWeekBounds(offset: number): { start: string; end: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const fmtDisplay = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return {
    start: fmt(monday),
    end: fmt(sunday),
    label: `${fmtDisplay(monday)} – ${fmtDisplay(sunday)}`,
  };
}

function barColor(calories: number, target: number): string {
  if (calories === 0) return Colors.border;
  const ratio = calories / target;
  if (ratio >= 0.85 && ratio <= 1.1) return Colors.accent;
  if (ratio < 0.85) return Colors.info;
  return Colors.danger;
}

export default function RecapSemaine() {
  const profile = useStore((s) => s.profile);
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const calorieTarget = profile?.calorie_target ?? 2000;
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

  useEffect(() => { load(); }, [load]);

  const activeDays = data.filter((d) => d.total_calories > 0);
  const avgCalories = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.total_calories, 0) / activeDays.length)
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

  const bestDay = activeDays.reduce<DailyEntry | null>((best, d) => {
    if (!best) return d;
    const dRatio = Math.abs(d.total_calories / calorieTarget - 1);
    const bRatio = Math.abs(best.total_calories / calorieTarget - 1);
    return dRatio < bRatio ? d : best;
  }, null);

  const worstDay = activeDays.reduce<DailyEntry | null>((worst, d) => {
    if (!worst) return d;
    const dRatio = Math.abs(d.total_calories / calorieTarget - 1);
    const wRatio = Math.abs(worst.total_calories / calorieTarget - 1);
    return dRatio > wRatio ? d : worst;
  }, null);

  const chartData = data.map((d, i) => ({
    x: DAY_LABELS[i] ?? i,
    y: Math.round(d.total_calories),
    fill: barColor(d.total_calories, calorieTarget),
  }));

  function dayLabel(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📅 Récap de la semaine</Text>
      </View>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setWeekOffset((o) => o - 1)}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{bounds.label}</Text>
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
          {/* Calorie bar chart */}
          <Card style={styles.chartCard}>
            <Text style={styles.cardTitle}>Calories par jour</Text>
            <Text style={styles.cardSub}>Objectif : {calorieTarget} kcal/jour</Text>
            <VictoryChart height={200} padding={{ top: 10, bottom: 40, left: 50, right: 16 }}>
              <VictoryAxis
                tickFormat={(t) => t}
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
              <VictoryBar
                data={chartData}
                style={{ data: { fill: ({ datum }) => datum.fill as string, width: 28 } }}
                cornerRadius={{ top: 4 }}
              />
            </VictoryChart>
            {/* Legend */}
            <View style={styles.legend}>
              {[
                { color: Colors.accent, label: 'Dans l\'objectif' },
                { color: Colors.info, label: 'En dessous' },
                { color: Colors.danger, label: 'Au-dessus' },
              ].map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendText}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* 4 summary stat cards */}
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
              <Text style={[styles.statValue, { color: Colors.accent }]}>
                {bestDay ? dayLabel(bestDay.date) : '—'}
              </Text>
              <Text style={styles.statLabel}>Meilleur jour</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.warning }]}>
                {worstDay ? dayLabel(worstDay.date) : '—'}
              </Text>
              <Text style={styles.statLabel}>Jour à améliorer</Text>
            </Card>
          </View>

          {/* Macro averages */}
          <Card style={styles.macroCard}>
            <Text style={styles.cardTitle}>Moyennes des macros</Text>
            <View style={styles.macroRow}>
              <View style={styles.macroBox}>
                <Text style={[styles.macroVal, { color: Colors.proteinColor }]}>{avgProtein}g</Text>
                <Text style={styles.macroLabel}>Protéines</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={[styles.macroVal, { color: Colors.carbsColor }]}>{avgCarbs}g</Text>
                <Text style={styles.macroLabel}>Glucides</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={[styles.macroVal, { color: Colors.fatColor }]}>{avgFat}g</Text>
                <Text style={styles.macroLabel}>Lipides</Text>
              </View>
            </View>
          </Card>

          {/* Day-by-day detail */}
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
  loadingBox: { height: 200, alignItems: 'center', justifyContent: 'center' },
  chartCard: { gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardSub: { fontSize: 12, color: Colors.textMuted },
  legend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '45%', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  macroCard: { gap: 12 },
  macroRow: { flexDirection: 'row', gap: 12 },
  macroBox: { flex: 1, backgroundColor: Colors.bgPrimary, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  macroVal: { fontSize: 20, fontWeight: '700' },
  macroLabel: { fontSize: 11, color: Colors.textSecondary },
  detailCard: { gap: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayName: { width: 36, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  dayCal: { fontSize: 13, fontWeight: '700', minWidth: 90 },
  dayMacros: { flex: 1, fontSize: 11, color: Colors.textMuted },
  dayEmpty: { flex: 1, fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
});
