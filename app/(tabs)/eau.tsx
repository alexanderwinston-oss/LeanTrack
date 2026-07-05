import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import {
  addWaterFavorite, checkAllAchievements, deleteWaterEntry,
  deleteWaterFavorite, getWaterFavorites, getWaterLogsForDate,
} from '@/lib/db';
import { getLocalDateString, utcToLocalTimeString } from '@/lib/utils';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { registerModal } from '@/lib/useModalManager';

const RING_SIZE = 220;
const STROKE = 16;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const QUICK_AMOUNTS = [150, 250, 330, 500, 750];

export default function Eau() {
  const profile = useStore((s) => s.profile);
  const waterMl = useStore((s) => s.waterMl);
  const addWaterToStore = useStore((s) => s.addWaterToStore);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const [logs, setLogs] = useState<{ id: number; amount_ml: number; created_at: string }[]>([]);
  const [favorites, setFavorites] = useState<{ id: number; amount_ml: number; label: string | null }[]>([]);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [addingWater, setAddingWater] = useState(false);

  const target = profile?.water_target ?? 2000;
  const ratio = Math.min(waterMl / target, 1);
  const goalReached = waterMl >= target;

  // Animation for the goal celebration emoji
  const celebScale = useRef(new Animated.Value(1)).current;

  registerModal('waterCustom', customModalVisible, () => {
    setCustomModalVisible(false);
    setCustomInput('');
  }, 10);

  useFocusEffect(
    React.useCallback(() => {
      const today = getLocalDateString();
      loadWaterData(today);
      getWaterFavorites().then(setFavorites).catch(() => {});
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

  async function addWater(ml: number) {
    const today = getLocalDateString();
    setAddingWater(true);
    try {
      await addWaterToStore(today, ml);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newLogs = await getWaterLogsForDate(today);
      setLogs(newLogs);
      const newlyUnlocked = await checkAllAchievements();
      newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'eau. Réessaie.');
    } finally {
      setAddingWater(false);
    }
  }

  function handleDeleteFavorite(id: number) {
    Alert.alert('Supprimer ce favori ?', '', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteWaterFavorite(id);
          setFavorites(await getWaterFavorites());
        },
      },
    ]);
  }

  async function handleSaveFavorite() {
    const ml = parseInt(customInput, 10);
    if (!ml || ml < 50 || ml > 2000) return;
    setSavingFavorite(true);
    try {
      await addWaterFavorite(ml);
      setFavorites(await getWaterFavorites());
      Alert.alert('⭐ Ajouté aux favoris !', `${ml} ml sauvegardé`);
    } catch (err: any) {
      if (err?.message === 'MAX_FAVORITES') {
        Alert.alert('Limite atteinte', 'Tu as atteint le maximum de 8 favoris.');
      }
    } finally {
      setSavingFavorite(false);
    }
  }

  async function handleConfirmCustom() {
    const ml = parseInt(customInput, 10);
    if (!ml || ml < 50 || ml > 2000) {
      Alert.alert('Volume invalide', 'Entre un volume entre 50 et 2000 ml');
      return;
    }
    await addWater(ml);
    setCustomModalVisible(false);
    setCustomInput('');
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
          <View style={styles.quickGrid}>
            {QUICK_AMOUNTS.map((ml) => (
              <TouchableOpacity
                key={ml}
                style={[styles.quickBtn, addingWater && { opacity: 0.5 }]}
                onPress={() => addWater(ml)}
                disabled={addingWater}
              >
                <Text style={styles.quickBtnIcon}>💧</Text>
                <Text style={styles.quickBtnText}>+{ml}ml</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnCustom]}
              onPress={() => setCustomModalVisible(true)}
            >
              <Text style={styles.quickBtnIcon}>✏️</Text>
              <Text style={styles.quickBtnText}>Personnaliser</Text>
            </TouchableOpacity>
          </View>

          {favorites.length > 0 && (
            <>
              <Text style={styles.favoritesTitle}>⭐ Mes contenants</Text>
              <View style={styles.quickGrid}>
                {favorites.map((fav) => (
                  <TouchableOpacity
                    key={fav.id}
                    style={[styles.quickBtn, styles.quickBtnFav, addingWater && { opacity: 0.5 }]}
                    onPress={() => addWater(fav.amount_ml)}
                    onLongPress={() => handleDeleteFavorite(fav.id)}
                    disabled={addingWater}
                  >
                    <Text style={styles.quickBtnIcon}>⭐</Text>
                    <Text style={styles.quickBtnText}>{fav.label ?? `${fav.amount_ml}ml`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.favoritesHint}>Appui long sur un favori pour le supprimer</Text>
            </>
          )}
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

      <KeyboardAwareModal
        visible={customModalVisible}
        onClose={() => { setCustomModalVisible(false); setCustomInput(''); }}
      >
        <Text style={styles.customTitle}>💧 Volume personnalisé</Text>
        <Text style={styles.customSubtitle}>Entre le volume en millilitres</Text>

        <TextInput
          style={styles.customInput}
          value={customInput}
          onChangeText={setCustomInput}
          keyboardType="number-pad"
          placeholder="Ex: 400"
          placeholderTextColor="#475569"
          autoFocus
          maxLength={4}
        />

        <TouchableOpacity
          style={styles.saveAsFavBtn}
          disabled={savingFavorite}
          onPress={handleSaveFavorite}
        >
          <Text style={styles.saveAsFavText}>
            {savingFavorite ? '...' : '⭐ Sauvegarder comme favori'}
          </Text>
        </TouchableOpacity>

        <View style={styles.customButtons}>
          <TouchableOpacity
            style={styles.customCancelBtn}
            onPress={() => { setCustomModalVisible(false); setCustomInput(''); }}
          >
            <Text style={styles.customCancelText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.customConfirmBtn,
              (!customInput || parseInt(customInput, 10) < 50) && { opacity: 0.4 },
            ]}
            disabled={!customInput || parseInt(customInput, 10) < 50}
            onPress={handleConfirmCustom}
          >
            <Text style={styles.customConfirmText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareModal>
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
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: {
    flex: 1, minWidth: '28%',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.waterColor,
    padding: 12, alignItems: 'center', gap: 4,
  },
  quickBtnIcon: { fontSize: 20 },
  quickBtnText: { color: Colors.waterColor, fontWeight: '700', fontSize: 13 },
  quickBtnCustom: {
    borderColor: '#64748b',
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderStyle: 'dashed',
  },
  quickBtnFav: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  favoritesTitle: {
    color: Colors.textPrimary, fontWeight: '600', fontSize: 13,
    marginTop: 8, marginBottom: 6,
  },
  favoritesHint: {
    color: Colors.textMuted, fontSize: 10, textAlign: 'center',
    marginTop: 4,
  },
  customTitle: {
    color: Colors.textPrimary, fontWeight: '700', fontSize: 18,
    marginBottom: 4,
  },
  customSubtitle: {
    color: Colors.textSecondary, fontSize: 13, marginBottom: 16,
  },
  customInput: {
    backgroundColor: '#0f172a', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    color: '#f1f5f9', fontSize: 32, fontWeight: '700',
    textAlign: 'center', padding: 16, marginBottom: 12,
  },
  saveAsFavBtn: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 10, padding: 12,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#fbbf24',
  },
  saveAsFavText: { color: '#fbbf24', fontWeight: '600', fontSize: 13 },
  customButtons: { flexDirection: 'row', gap: 12 },
  customCancelBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: '#1e293b', alignItems: 'center',
  },
  customCancelText: { color: '#94a3b8', fontWeight: '600' },
  customConfirmBtn: {
    flex: 2, padding: 14, borderRadius: 12,
    backgroundColor: '#38bdf8', alignItems: 'center',
  },
  customConfirmText: { color: '#fff', fontWeight: '700' },
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
