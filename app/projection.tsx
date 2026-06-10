import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryScatter } from 'victory-native';
import { router, useFocusEffect } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import {
  getProfile, getWeightHistory, updateWeightEntry, deleteWeightEntry,
  recalculateTargetsAfterWeighIn, checkAllAchievements, updateWeightInitial,
} from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import { useBackHandler } from '@/lib/useBackHandler';
import { useStore } from '@/lib/store';
import { calcProjection } from '@/lib/nutrition';
import { UserProfile, WeightEntry } from '@/lib/types';

const shownMilestonesThisSession = new Set<number>();

function getWeighInSchedule(start: Date, end: Date): Date[] {
  const cap = new Date();
  cap.setDate(cap.getDate() - 90);
  const effective = start < cap ? cap : start;
  const d = new Date(effective);
  const daysToTue = (2 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysToTue);
  d.setHours(0, 0, 0, 0);
  const schedule: Date[] = [];
  while (d <= end && schedule.length < 60) {
    schedule.push(new Date(d));
    d.setDate(d.getDate() + 14);
  }
  return schedule;
}

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
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [selectedWeighInDate, setSelectedWeighInDate] = useState('');
  const [newWeightInput, setNewWeightInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [healRan, setHealRan] = useState(false);

  useEffect(() => {
    if (healRan || !profile) return;
    setHealRan(true);
    if (!profile.weight_initial || profile.weight_initial === 0) {
      getWeightHistory(365).then(hist => {
        const startWeight = hist.length > 0
          ? Math.max(...hist.map(w => w.weight))
          : profile.weight_current;
        updateWeightInitial(startWeight).then(() => {
          getProfile().then(updated => {
            if (updated) useStore.getState().setProfile(updated);
            loadData();
          });
        });
      });
    }
  }, [profile?.id]);

  useBackHandler(() => {
    if (weightModalVisible) { setWeightModalVisible(false); return true; }
    return false;
  }, [weightModalVisible]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const targetDate = useMemo(() => {
    if (profile?.target_date)
      return new Date(profile.target_date + 'T00:00:00');
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d;
  }, [profile?.target_date]);

  const scheduleStart = useMemo(() => {
    const cap = new Date();
    cap.setDate(cap.getDate() - 90);
    const firstLogDate = weightHistory.length > 0
      ? new Date(weightHistory[0].date + 'T00:00:00')
      : new Date();
    return firstLogDate > cap ? firstLogDate : cap;
  }, [weightHistory[0]?.date]);

  const weighInDates = useMemo(
    () => getWeighInSchedule(scheduleStart, targetDate),
    [scheduleStart.toDateString(), targetDate.toDateString()]
  );

  async function loadData() {
    const [p, hist] = await Promise.all([getProfile(), getWeightHistory(90)]);
    if (!p) return;
    setProfile(p);
    const history = [...hist].reverse();
    setWeightHistory(history);

    if (history.length > 0) {
      const latestWeight = history[history.length - 1].weight;
      const weightInitial = Math.max(
        p.weight_initial ?? 0,
        ...(history.map(w => w.weight)),
        p.weight_current ?? 0
      );
      const denominator = weightInitial - (p.weight_target ?? 0);
      const percent = denominator > 0
        ? Math.min(Math.max(Math.round(((weightInitial - latestWeight) / denominator) * 100), 0), 100)
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

  const historyData = weightHistory
    .map(w => ({ x: new Date(w.date + 'T00:00:00'), y: w.weight }))
    .sort((a, b) => a.x.getTime() - b.x.getTime());
  const projectionData = projectionPoints.map(p => ({ x: new Date(p.date + 'T00:00:00'), y: p.weight }));

  const allWeights = [
    ...historyData.map(d => d.y),
    ...projectionData.map(d => d.y),
  ].filter(w => w > 0);
  const yMin = allWeights.length > 0 ? Math.max(Math.floor(Math.min(...allWeights)) - 3, 0) : 80;
  const yMax = allWeights.length > 0 ? Math.ceil(Math.max(...allWeights)) + 3 : 120;

  const latestWeight: number | null = weightHistory.length > 0
    ? weightHistory[weightHistory.length - 1].weight
    : null;

  const ecartRestant = latestWeight !== null
    ? Math.abs(latestWeight - profile.weight_target).toFixed(1)
    : '—';
  const estimatedDateStr = projectionPoints.length > 0
    ? format(parseISO(projectionPoints[projectionPoints.length - 1].date), 'dd MMMM yyyy', { locale: fr })
    : '—';

  const celebContent = getCelebrationContent(celebrationPercent);

  const todayStr = getLocalDateString();

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
            domain={{ y: [yMin, yMax] }}
          >
            <VictoryAxis
              tickValues={
                historyData.length > 0
                  ? historyData.map(d => d.x)
                  : projectionData.filter((_, i) => i % 14 === 0).map(d => d.x)
              }
              tickFormat={d => format(new Date(d), 'dd/MM', { locale: fr })}
              style={{ tickLabels: { fontSize: 9, fill: '#94a3b8', angle: -20 } }}
            />
            <VictoryAxis
              dependentAxis
              style={{ tickLabels: { fontSize: 9, fill: '#94a3b8' } }}
            />
            <VictoryLine
              data={projectionData}
              style={{ data: { stroke: '#475569', strokeDasharray: '5,5', strokeWidth: 1.5 } }}
            />
            {historyData.length >= 2 && (
              <VictoryLine
                data={historyData}
                style={{ data: { stroke: '#10b981', strokeWidth: 2.5 } }}
              />
            )}
            {historyData.length >= 1 && (
              <VictoryScatter
                data={historyData}
                size={5}
                style={{ data: { fill: '#10b981' } }}
              />
            )}
          </VictoryChart>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: '#475569' }]} />
              <Text style={styles.legendLabel}>Projection</Text>
            </View>
            {historyData.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: '#10b981' }]} />
                <Text style={styles.legendLabel}>Poids réel</Text>
              </View>
            )}
          </View>
          {historyData.length === 0 && (
            <Text style={styles.noDataNote}>Aucune pesée enregistrée — ajoute ton poids dans Profil</Text>
          )}
        </Card>
      )}

      {/* Stat cards — 2-column grid */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Poids actuel</Text>
          <Text style={styles.statNum}>{latestWeight !== null ? `${latestWeight} kg` : '—'}</Text>
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
      {latestWeight !== null && (
        <Card style={styles.progressCard}>
          <Text style={styles.progressLabel}>Progression</Text>
          <Text style={styles.progressNum}>{progressPercent}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
          </View>
        </Card>
      )}

      {/* Plan de pesée */}
      <View style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
          ⚖️ Plan de pesée
        </Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
          Tous les 2 mardis · Matin à jeun
        </Text>
        {weighInDates.map((date, index) => {
          const dateStr = getLocalDateString(date);
          const isPast = date < new Date() && dateStr !== todayStr;
          const isToday = dateStr === todayStr;
          const recorded = weightHistory.find((w) => {
            const diffMs = Math.abs(new Date(w.date + 'T00:00:00').getTime() - date.getTime());
            return diffMs < 4 * 24 * 60 * 60 * 1000;
          });
          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => {
                setSelectedWeighInDate(dateStr);
                setNewWeightInput(recorded ? String(recorded.weight) : '');
                setWeightModalVisible(true);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: index < weighInDates.length - 1 ? 1 : 0,
                borderBottomColor: '#334155',
              }}
            >
              <View>
                <Text style={{
                  color: isToday ? '#10b981' : isPast ? '#94a3b8' : '#f1f5f9',
                  fontWeight: isToday ? '700' : '400', fontSize: 14,
                }}>
                  {format(date, 'EEEE dd MMMM', { locale: fr })}{isToday ? ' (aujourd\'hui)' : ''}
                </Text>
                {recorded && (
                  <Text style={{ color: '#10b981', fontSize: 12, marginTop: 2 }}>✓ {recorded.weight} kg enregistré</Text>
                )}
                {!recorded && isPast && (
                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 2 }}>Non pesé</Text>
                )}
                {!recorded && !isPast && (
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Tap pour enregistrer</Text>
                )}
              </View>
              <Text style={{ color: '#10b981', fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 90 }} />

      {/* Weight entry modal */}
      <KeyboardAwareModal
        visible={weightModalVisible}
        onClose={() => { setWeightModalVisible(false); setNewWeightInput(''); }}
      >
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
          ⚖️ Enregistrer mon poids
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
          {selectedWeighInDate
            ? format(new Date(selectedWeighInDate + 'T00:00:00'), 'EEEE dd MMMM yyyy', { locale: fr })
            : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <TextInput
            value={newWeightInput}
            onChangeText={setNewWeightInput}
            keyboardType="decimal-pad"
            placeholder="Ex: 108.5"
            placeholderTextColor="#475569"
            style={{ flex: 1, color: '#f1f5f9', fontSize: 28, fontWeight: '700' }}
            autoFocus
          />
          <Text style={{ color: '#64748b', fontSize: 18 }}>kg</Text>
        </View>
        {/* Bouton suppression — visible uniquement si pesée existante */}
        {weighInDates.some(d => {
          const recorded = weightHistory.find(w => Math.abs(new Date(w.date + 'T00:00:00').getTime() - d.getTime()) < 4 * 24 * 60 * 60 * 1000);
          return recorded && getLocalDateString(d) === selectedWeighInDate;
        }) && (
          <TouchableOpacity
            onPress={() => Alert.alert(
              'Supprimer cette pesée',
              `Supprimer le poids du ${selectedWeighInDate ? format(new Date(selectedWeighInDate + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr }) : ''} ?`,
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer', style: 'destructive',
                  onPress: async () => {
                    setWeightModalVisible(false);
                    setNewWeightInput('');
                    await deleteWeightEntry(selectedWeighInDate);
                    const remaining = await getWeightHistory(365);
                    const prevWeight = remaining.length > 0 ? remaining[0].weight : profile?.weight_current ?? 0;
                    await recalculateTargetsAfterWeighIn(prevWeight);
                    const upd = await getProfile();
                    if (upd) useStore.getState().setProfile(upd);
                    const newlyUnlocked = await checkAllAchievements();
                    newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
                    loadData();
                  },
                },
              ]
            )}
            style={{ padding: 14, borderRadius: 12, backgroundColor: '#7f1d1d', alignItems: 'center', marginBottom: 10 }}
          >
            <Text style={{ color: '#fca5a5', fontWeight: '600' }}>🗑️ Supprimer cette pesée</Text>
          </TouchableOpacity>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => { setWeightModalVisible(false); setNewWeightInput(''); }}
            style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center' }}
          >
            <Text style={{ color: '#94a3b8' }}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={isSaving}
            onPress={async () => {
              const w = parseFloat(newWeightInput.replace(',', '.'));
              if (isNaN(w) || w < 20 || w > 500) return;
              setIsSaving(true);
              try {
                await updateWeightEntry(selectedWeighInDate, w);
                await recalculateTargetsAfterWeighIn(w);
                const upd = await getProfile();
                if (upd) useStore.getState().setProfile(upd);
                const newlyUnlocked = await checkAllAchievements();
                newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
                setWeightModalVisible(false);
                setNewWeightInput('');
                loadData();
              } finally {
                setIsSaving(false);
              }
            }}
            style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center', opacity: isSaving ? 0.5 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isSaving ? '...' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareModal>

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
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 20, height: 3, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary },
  noDataNote: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 8 },
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
