import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import { checkAllAchievements, deleteWaterEntry, getWaterLogsForDate } from '@/lib/db';
import { getLocalDateString, utcToLocalTimeString } from '@/lib/utils';
import { WaterQuickAdd } from '@/components/WaterQuickAdd';

const RING_SIZE = 220;
const STROKE = 16;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const QUICK_AMOUNTS = [150, 250, 330, 500, 750];

export default function Eau() {
  const profile = useStore((s) => s.profile);
  const waterMl = useStore((s) => s.waterMl);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const [logs, setLogs] = useState<{ id: number; amount_ml: number; created_at: string }[]>([]);

  const target = profile?.water_target ?? 2000;
  const ratio = Math.min(waterMl / target, 1);
  const goalReached = waterMl >= target;

  // Animation for the goal celebration emoji
  const celebScale = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    React.useCallback(() => {
      loadWaterData(getLocalDateString());
    }, [])
  );

  useEffect(() => {
    if (goalReached) {
      Animated.sequence([
        Animated.spring(celebScale, { toValue: 1.5, friction: 3, useNativeDriver: true }),
        Animated.spring(celebScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [goalReached]);

  async function loadWaterData(today: string) {
    await refreshDailyData(today);
    const newLogs = await getWaterLogsForDate(today);
    setLogs(newLogs);
  }

  async function handleDeleteEntry(id: number) {
    const today = getLocalDateString();
    await deleteWaterEntry(id);
    await refreshDailyData(today);
    const newLogs = await getWaterLogsForDate(today);
    setLogs(newLogs);
    const newlyUnlocked = await checkAllAchievements();
    newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
  }

  const percent = Math.round(ratio * 100);
  const strokeDashoffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <ScreenContainer>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>💧 Hydratation</Text>
          <Text style={styles.date}>{format(new Date(), 'd MMMM', { locale: fr })}</Text>
        </View>

        {/* Ring */}
        <View style={styles.ringContainer}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
              stroke={Colors.bgElevated} strokeWidth={STROKE} fill="none"
            />
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
              stroke={goalReached ? Colors.accent : Colors.waterColor} strokeWidth={STROKE} fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.waterMain, goalReached && { color: Colors.accent }]}>{waterMl}</Text>
            <Text style={styles.waterUnit}>ml</Text>
            <Text style={styles.waterTarget}>/ {target} ml</Text>
            <Text style={styles.waterPercent}>{percent}%</Text>
          </View>
        </View>

        {/* Goal celebration */}
        {goalReached && (
          <View style={styles.goalBanner}>
            <Animated.Text style={[styles.goalBannerEmoji, { transform: [{ scale: celebScale }] }]}>💪</Animated.Text>
            <Text style={styles.goalBannerText}>Objectif hydratation atteint !</Text>
          </View>
        )}

        {/* Quick add */}
        <Card style={styles.quickCard}>
          <Text style={styles.quickTitle}>Ajouter rapidement</Text>
          <WaterQuickAdd
            quickAmounts={QUICK_AMOUNTS}
            onAdded={() => loadWaterData(getLocalDateString())}
          />
        </Card>

        {/* Conseil */}
        <Card style={styles.tipCard}>
          <Text style={styles.tipEmoji}>💡</Text>
          <Text style={styles.tipText}>Bois un verre d'eau toutes les 2 heures pour rester bien hydraté(e)</Text>
        </Card>

        {/* Logs */}
        {logs.length > 0 && (
          <View>
            <Text style={styles.logsTitle}>Verres d'aujourd'hui</Text>
            {[...logs].reverse().map((log) => (
              <Card key={log.id} style={styles.logItem}>
                <Text style={styles.logEmoji}>🥤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logAmount}>{log.amount_ml} ml</Text>
                </View>
                <Text style={styles.logTime}>
                  {utcToLocalTimeString(log.created_at)}
                </Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteEntry(log.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}
        <View style={{ height: BOTTOM_SPACER_HEIGHT }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 12, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: 14, color: Colors.textSecondary },
  ringContainer: {
    alignSelf: 'center',
    width: RING_SIZE, height: RING_SIZE,
    alignItems: 'center', justifyContent: 'center',
  },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  waterMain: { fontSize: 42, fontWeight: '800', color: Colors.waterColor },
  waterUnit: { fontSize: 16, color: Colors.waterColor, fontWeight: '600' },
  waterTarget: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  waterPercent: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  goalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accentSubtle,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: 14,
  },
  goalBannerEmoji: { fontSize: 28 },
  goalBannerText: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  quickCard: { gap: 12 },
  quickTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipEmoji: { fontSize: 24 },
  tipText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  logsTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, paddingVertical: 10 },
  logEmoji: { fontSize: 20 },
  logAmount: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  logTime: { fontSize: 13, color: Colors.textSecondary },
  deleteBtn: { padding: 4, marginLeft: 6 },
  deleteText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
});
