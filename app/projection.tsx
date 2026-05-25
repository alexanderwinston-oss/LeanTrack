import React, { useRef, useState } from 'react';
import {
  Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine } from 'victory-native';
import { router, useFocusEffect } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { getProfile, getWeightHistory } from '@/lib/db';
import { calcProjection } from '@/lib/nutrition';
import { UserProfile, WeightEntry } from '@/lib/types';

const shownMilestonesThisSession = new Set<number>();

const getCelebrationContent = (percent: number) => {
  if (percent >= 100) return { emoji: '🏆', text: 'Objectif atteint !' };
  if (percent >= 75) return { emoji: '🔥', text: '75% de l\'objectif atteint !' };
  if (percent >= 50) return { emoji: '⭐', text: 'Mi-chemin franchi !' };
  return { emoji: '💪', text: '25% de l\'objectif atteint !' };
};

export default function Projection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationPercent, setCelebrationPercent] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const [p, hist] = await Promise.all([getProfile(), getWeightHistory(90)]);
    if (!p) return;
    setProfile(p);
    const history = [...hist].reverse();
    setWeightHistory(history);

    if (history.length > 0) {
      const latestWeight = history[history.length - 1].weight;
      const totalToLose = p.weight_current - p.weight_target;
      const lost = p.weight_current - latestWeight;
      const percent = totalToLose > 0
        ? Math.min(Math.round((lost / totalToLose) * 100), 100)
        : 0;
      setProgressPercent(percent);

      for (const m of [25, 50, 75, 100]) {
        if (percent >= m && !shownMilestonesThisSession.has(m)) {
          shownMilestonesThisSession.add(m);
          setCelebrationPercent(m);
          setShowCelebration(true);
          scaleAnim.setValue(0);
          Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }).start();
          break;
        }
      }
    }
  }

  function closeCelebration() {
    Animated.spring(scaleAnim, { toValue: 0, friction: 5, useNativeDriver: true }).start(() => {
      setShowCelebration(false);
    });
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Chargement...</Text>
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

  const historyData = weightHistory.map(e => ({ x: new Date(e.date), y: e.weight }));
  const projectionData = projectionPoints.map(p => ({ x: new Date(p.date), y: p.weight }));

  const latestWeight = weightHistory.length > 0
    ? weightHistory[weightHistory.length - 1].weight
    : profile.weight_current;

  const ecartRestant = Math.abs(latestWeight - profile.weight_target).toFixed(1);
  const estimatedDateStr = projectionPoints.length > 0
    ? format(parseISO(projectionPoints[projectionPoints.length - 1].date), 'dd MMMM yyyy', { locale: fr })
    : '—';

  const celebContent = getCelebrationContent(celebrationPercent);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📊 Ma projection</Text>
      </View>

      {projectionData.length > 0 && (
        <Card style={styles.chartCard}>
          <Text style={styles.chartTitle}>Courbe de progression</Text>
          <VictoryChart
            width={Dimensions.get('window').width - 32}
            height={220}
            scale={{ x: 'time' }}
          >
            <VictoryAxis
              tickCount={4}
              tickFormat={d => format(new Date(d), 'dd MMM', { locale: fr })}
              style={{ tickLabels: { fontSize: 9, fill: '#94a3b8' } }}
            />
            <VictoryAxis
              dependentAxis
              style={{ tickLabels: { fontSize: 9, fill: '#94a3b8' } }}
            />
            <VictoryLine
              data={projectionData}
              style={{ data: { stroke: '#475569', strokeDasharray: '5,5', strokeWidth: 1.5 } }}
            />
            {historyData.length > 0 && (
              <VictoryLine
                data={historyData}
                style={{ data: { stroke: '#10b981', strokeWidth: 2.5 } }}
              />
            )}
          </VictoryChart>
        </Card>
      )}

      {/* Stat cards — 2-column grid */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Poids actuel</Text>
          <Text style={styles.statNum}>{latestWeight} kg</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Objectif</Text>
          <Text style={[styles.statNum, { color: Colors.accent }]}>{profile.weight_target} kg</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Écart restant</Text>
          <Text style={[styles.statNum, { color: Colors.warning }]}>{ecartRestant} kg</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Date estimée</Text>
          <Text style={[styles.statNum, { fontSize: 13, color: Colors.accent }]}>{estimatedDateStr}</Text>
        </Card>
      </View>

      {/* Progress */}
      <Card style={styles.progressCard}>
        <Text style={styles.progressLabel}>Progression</Text>
        <Text style={styles.progressNum}>{progressPercent}%</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
        </View>
      </Card>

      <View style={{ height: 40 }} />

      {/* Celebration modal */}
      <Modal visible={showCelebration} transparent animationType="none">
        <View style={styles.overlay}>
          <Animated.View style={[styles.celebCard, { transform: [{ scale: scaleAnim }] }]}>
            <Text style={styles.celebEmoji}>{celebContent.emoji}</Text>
            <Text style={styles.celebText}>{celebContent.text}</Text>
            <Pressable style={styles.celebBtn} onPress={closeCelebration}>
              <Text style={styles.celebBtnText}>Super !</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  chartCard: { gap: 8, paddingHorizontal: 0, overflow: 'hidden' },
  chartTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '44%', gap: 4 },
  statLabel: { fontSize: 11, color: Colors.textSecondary },
  statNum: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  progressCard: { gap: 10 },
  progressLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  progressNum: { fontSize: 40, fontWeight: '800', color: Colors.accent },
  progressTrack: { height: 10, backgroundColor: Colors.bgElevated, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  celebCard: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    padding: 32, alignItems: 'center', gap: 16,
    borderWidth: 1, borderColor: Colors.accent, width: '80%',
  },
  celebEmoji: { fontSize: 56 },
  celebText: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  celebBtn: {
    backgroundColor: Colors.accent, borderRadius: Colors.radiusPill,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  celebBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
