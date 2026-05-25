import React, { useCallback, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryTheme } from 'victory-native';
import { useFocusEffect, router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { useStore } from '@/lib/store';
import { getWeightHistory } from '@/lib/db';
import { calcProjection } from '@/lib/nutrition';
import { WeightEntry } from '@/lib/types';

const { width } = Dimensions.get('window');

export default function Projection() {
  const profile = useStore((s) => s.profile);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getWeightHistory(90).then((data) => setWeightHistory([...data].reverse()));
    }, [])
  );

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Profil non configuré</Text>
        </View>
      </View>
    );
  }

  const projectionPoints = calcProjection(
    profile.weight_current,
    profile.weight_target,
    profile.tdee,
    profile.calorie_target,
    profile.target_date
  );

  const realPoints = weightHistory.map((e) => ({ x: e.date, y: e.weight }));
  const projPoints = projectionPoints.map((e) => ({ x: e.date, y: e.weight }));

  const allWeights = [
    ...projPoints.map((p) => p.y),
    ...realPoints.map((p) => p.y),
    profile.weight_target,
  ];
  const minW = Math.min(...allWeights) - 2;
  const maxW = Math.max(...allWeights) + 2;

  const weightDiff = profile.weight_current - profile.weight_target;
  const weeklyChange = Math.abs(profile.tdee - profile.calorie_target) * 7 / 7700;
  const weeksToGoal = weeklyChange > 0 ? Math.abs(weightDiff) / weeklyChange : 0;
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + Math.round(weeksToGoal * 7));

  // Simplify axis labels for space
  const projTickValues = projPoints.filter((_, i) => i % Math.max(1, Math.floor(projPoints.length / 4)) === 0).map((p) => p.x);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📊 Ma projection</Text>
      </View>

      {/* Stats cards */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{profile.weight_current} kg</Text>
          <Text style={styles.statLabel}>Poids actuel</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statNum, { color: Colors.accent }]}>{profile.weight_target} kg</Text>
          <Text style={styles.statLabel}>Objectif</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statNum, { color: weightDiff > 0 ? Colors.danger : Colors.accent }]}>
            {weightDiff > 0 ? '-' : '+'}{Math.abs(weightDiff).toFixed(1)} kg
          </Text>
          <Text style={styles.statLabel}>Écart</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statNum, { color: Colors.warning }]}>
            {weeksToGoal < 1 ? '< 1 sem.' : `${Math.round(weeksToGoal)} sem.`}
          </Text>
          <Text style={styles.statLabel}>Durée estimée</Text>
        </Card>
      </View>

      {/* Chart */}
      <Card style={styles.chartCard}>
        <Text style={styles.chartTitle}>Courbe de progression</Text>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
            <Text style={styles.legendText}>Projection</Text>
          </View>
          {realPoints.length > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.proteinColor }]} />
              <Text style={styles.legendText}>Réel</Text>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
            <Text style={styles.legendText}>Objectif</Text>
          </View>
        </View>

        {realPoints.length === 0 && (
          <View style={styles.noDataHint}>
            <Text style={styles.noDataText}>
              Saisis ton poids quotidiennement dans Profil pour voir ta courbe réelle
            </Text>
          </View>
        )}

        {projPoints.length > 1 && (
          <VictoryChart
            width={width - 72}
            height={240}
            theme={VictoryTheme.material}
            domain={{ y: [minW, maxW] }}
            padding={{ top: 16, bottom: 40, left: 48, right: 16 }}
          >
            <VictoryAxis
              tickValues={projTickValues}
              tickFormat={(t: string) => {
                try { return format(parseISO(t), 'dd MMM', { locale: fr }); } catch { return ''; }
              }}
              style={{
                axis: { stroke: Colors.bgElevated },
                tickLabels: { fill: Colors.textMuted, fontSize: 9 },
                grid: { stroke: 'transparent' },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t: number) => `${t}kg`}
              style={{
                axis: { stroke: Colors.bgElevated },
                tickLabels: { fill: Colors.textMuted, fontSize: 9 },
                grid: { stroke: Colors.bgElevated, strokeDasharray: '4,4' },
              }}
            />
            {/* Target line — always shown */}
            <VictoryLine
              data={projPoints.map((p) => ({ x: p.x, y: profile.weight_target }))}
              style={{ data: { stroke: Colors.warning, strokeWidth: 1.5, strokeDasharray: '6,4', opacity: 0.7 } }}
            />
            {/* Projection line — always shown */}
            <VictoryLine
              data={projPoints}
              style={{ data: { stroke: Colors.accent, strokeWidth: 2, strokeDasharray: '4,4' } }}
            />
            {/* Real line — only when data exists */}
            {realPoints.length > 1 && (
              <VictoryLine
                data={realPoints}
                style={{ data: { stroke: Colors.proteinColor, strokeWidth: 2.5 } }}
              />
            )}
          </VictoryChart>
        )}
      </Card>

      {/* Date estimée */}
      <Card style={styles.dateCard}>
        <Text style={styles.dateEmoji}>🎯</Text>
        <View>
          <Text style={styles.dateTitle}>Date estimée d'atteinte de l'objectif</Text>
          <Text style={styles.dateValue}>
            {format(estimatedDate, 'd MMMM yyyy', { locale: fr })}
          </Text>
        </View>
      </Card>

      {/* Calorie info */}
      <Card style={styles.caloCard}>
        <View style={styles.caloRow}>
          <View style={styles.caloItem}>
            <Text style={styles.caloNum}>{profile.tdee}</Text>
            <Text style={styles.caloLabel}>TDEE (kcal/j)</Text>
          </View>
          <Text style={styles.caloArrow}>→</Text>
          <View style={styles.caloItem}>
            <Text style={[styles.caloNum, { color: Colors.accent }]}>{profile.calorie_target}</Text>
            <Text style={styles.caloLabel}>Objectif (kcal/j)</Text>
          </View>
          <Text style={styles.caloArrow}>≈</Text>
          <View style={styles.caloItem}>
            <Text style={[styles.caloNum, { color: Colors.warning }]}>
              {weeklyChange > 0 ? (weeklyChange * 1000).toFixed(0) : '0'}g
            </Text>
            <Text style={styles.caloLabel}>Perte/semaine</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 40 },
  header: { gap: 8 },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, color: Colors.textSecondary },
  noDataHint: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  noDataText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '44%', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  chartCard: { gap: 12 },
  chartTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.textSecondary },
  dateCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateEmoji: { fontSize: 30 },
  dateTitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  dateValue: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  caloCard: {},
  caloRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  caloItem: { alignItems: 'center', gap: 2 },
  caloNum: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  caloLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  caloArrow: { fontSize: 18, color: Colors.textMuted },
});
