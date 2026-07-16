import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AppState, Dimensions, LayoutAnimation, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AchievementGrid, ALL_ACHIEVEMENTS } from '@/components/Achievements';
import { useStore } from '@/lib/store';
import {
  deleteWeightEntry, getAllWeightEntries,
  getAchievementStats, getProfile, getSetting, recalculateTargetsAfterActivityChange, resetAllData, saveProfile,
  setSetting, updateWeightEntry, updateWeightInitial,
} from '@/lib/db';
import { getTodayCaloriesBurned, hasHealthPermissions, isHealthConnectAvailable, openHealthConnectSettings, requestHealthPermissions } from '@/lib/healthConnect';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { cancelAllNotifications, scheduleAllNotifications } from '@/lib/notifications';
import { AchievementStats, ActivityLevel, WeightEntry } from '@/lib/types';

import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { registerModal } from '@/lib/useModalManager';
import { getLocalDateString, getLevel, getProfileName, getTotalXP, XP_LEVELS } from '@/lib/utils';
import { checkAchievementsAndNotify, LEVEL_FEATURES } from '@/lib/featureFlags';

const SCREEN_H = Dimensions.get('window').height;

const ACTIVITY_LABELS: Record<string, string> = {
  sedentaire: 'Sédentaire',
  leger: 'Léger',
  modere: 'Modéré',
  actif: 'Actif',
  tres_actif: 'Très actif',
};

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: 'sedentaire', label: 'Sédentaire', desc: 'Peu ou pas d\'exercice' },
  { value: 'leger', label: 'Léger', desc: '1 à 3 séances/semaine' },
  { value: 'modere', label: 'Modéré', desc: '3 à 5 séances/semaine' },
  { value: 'actif', label: 'Actif', desc: '6 à 7 séances/semaine' },
  { value: 'tres_actif', label: 'Très actif', desc: 'Activité physique intense quotidienne' },
];

const GOAL_LABELS: Record<string, string> = {
  perte: 'Perte de poids',
  maintien: 'Maintien',
  prise: 'Prise de masse',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function Profil() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const healthConnectEnabled = useStore((s) => s.healthConnectEnabled);
  const setHealthConnectEnabled = useStore((s) => s.setHealthConnectEnabled);
  const caloriesBurned = useStore((s) => s.caloriesBurned);
  const setCaloriesBurned = useStore((s) => s.setCaloriesBurned);
  const [syncingHealth, setSyncingHealth] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [weightDate, setWeightDate] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const unlockedIds = useStore((s) => s.unlockedAchievementIds);
  const [achievementStats, setAchievementStats] = useState<AchievementStats | null>(null);
  const [editWeightInitialVisible, setEditWeightInitialVisible] = useState(false);
  const [editWeightInitialInput, setEditWeightInitialInput] = useState('');
  const [levelsModalVisible, setLevelsModalVisible] = useState(false);
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [updatingActivity, setUpdatingActivity] = useState(false);

  registerModal('profilWeight', weightModal, () => setWeightModal(false), 10);
  registerModal('profilEditInitial', editWeightInitialVisible, () => setEditWeightInitialVisible(false), 5);
  registerModal('levelsGlossary', levelsModalVisible, () => setLevelsModalVisible(false), 5);
  registerModal('profilActivity', activityModalVisible, () => setActivityModalVisible(false), 5);

  useFocusEffect(
    useCallback(() => {
      loadWeightEntries();
      if (profile) {
        getAchievementStats(profile).then(setAchievementStats).catch(() => {});
        // checkAchievementsAndNotify() already refreshes unlockedAchievementIds in the
        // store when something changed — no need for a second, racing fetch here.
        checkAchievementsAndNotify().catch(() => {});
      }
    }, [profile])
  );

  // requestPermission()'s own result is unreliable when the user instead grants access
  // from Health Connect's own settings screen (see lib/healthConnect.ts) — re-check
  // whenever the app comes back to the foreground so that round trip gets picked up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheckHealthConnect();
    });
    return () => sub.remove();
  }, [healthConnectEnabled]);

  async function loadWeightEntries() {
    const entries = await getAllWeightEntries();
    setWeightEntries(entries);
  }

  function toggleLevelExpanded(level: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedLevel((prev) => (prev === level ? null : level));
  }

  const totalXP = useMemo(() => getTotalXP(unlockedIds), [unlockedIds]);
  const currentLevel = useMemo(() => getLevel(totalXP), [totalXP]);
  const nextLevel = useMemo(
    () => XP_LEVELS.find((l) => l.level === currentLevel.level + 1) ?? null,
    [currentLevel]
  );
  const xpInLevel = totalXP - currentLevel.min;
  const xpNeeded = nextLevel ? nextLevel.min - currentLevel.min : 1;
  const levelPct = nextLevel
    ? Math.min(Math.round((xpInLevel / xpNeeded) * 100), 100)
    : 100;

  if (!profile) {
    return (
      <ScreenContainer>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Profil non configuré</Text>
          <Button label="Créer mon profil" onPress={() => router.replace('/onboarding')} />
        </View>
      </ScreenContainer>
    );
  }

  async function toggleNotifications() {
    const updated = { ...profile!, notifications_enabled: !profile!.notifications_enabled } as NonNullable<typeof profile>;
    await saveProfile(updated);
    setProfile(updated);
    if (updated.notifications_enabled) {
      await scheduleAllNotifications({ notifications_enabled: true });
    } else {
      await cancelAllNotifications();
    }
  }

  function openAddWeight() {
    setWeightDate(getLocalDateString());
    setWeightInput(String(profile!.weight_current));
    setWeightModal(true);
  }

  function openEditWeight(entry: WeightEntry) {
    setWeightDate(entry.date);
    setWeightInput(String(entry.weight));
    setWeightModal(true);
  }

  async function handleDeleteWeight(date: string) {
    Alert.alert('Supprimer', `Supprimer l'entrée du ${date} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteWeightEntry(date);
          await loadWeightEntries();
        },
      },
    ]);
  }

  async function saveWeight() {
    const w = parseFloat(weightInput);
    if (!w || w < 20 || w > 500) {
      Alert.alert('Erreur', 'Poids invalide');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weightDate)) {
      Alert.alert('Erreur', 'Date invalide (format AAAA-MM-JJ)');
      return;
    }
    setSaving(true);
    try {
      await updateWeightEntry(weightDate, w);
      const today = getLocalDateString();
      if (weightDate === today) {
        const updated = { ...profile, weight_current: w } as NonNullable<typeof profile>;
        await saveProfile(updated);
        setProfile(updated);
        await checkAchievementsAndNotify();
      }
      setWeightModal(false);
      setWeightInput('');
      setWeightDate('');
      await loadWeightEntries();
      Alert.alert('✅', `Poids enregistré : ${w} kg`);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le poids. Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  async function handleActivityChange(newLevel: ActivityLevel) {
    if (newLevel === profile!.activity_level) {
      setActivityModalVisible(false);
      return;
    }
    setUpdatingActivity(true);
    try {
      await recalculateTargetsAfterActivityChange(newLevel);
      const updated = await getProfile();
      if (updated) setProfile(updated);
      await checkAchievementsAndNotify();
      setActivityModalVisible(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier le niveau d\'activité.');
    } finally {
      setUpdatingActivity(false);
    }
  }

  async function handleManualSync() {
    setSyncingHealth(true);
    try {
      const calories = await getTodayCaloriesBurned();
      setCaloriesBurned(calories);
    } finally {
      setSyncingHealth(false);
    }
  }

  async function recheckHealthConnect() {
    if (healthConnectEnabled) return;
    if (!(await isHealthConnectAvailable())) return;
    if (await hasHealthPermissions()) {
      await setSetting('health_connect_enabled', '1');
      await setSetting('health_connect_ever_connected', '1');
      setHealthConnectEnabled(true);
      await handleManualSync();
    }
  }

  async function handleHealthConnectToggle() {
    if (!healthConnectEnabled) {
      setSyncingHealth(true);
      try {
        const available = await isHealthConnectAvailable();
        if (!available) {
          Alert.alert(
            'Health Connect indisponible',
            'Health Connect n\'est pas installé sur cet appareil. Installe l\'app Health Connect depuis le Play Store.'
          );
          return;
        }
        const granted = await requestHealthPermissions();
        if (granted) {
          await setSetting('health_connect_enabled', '1');
          await setSetting('health_connect_ever_connected', '1');
          setHealthConnectEnabled(true);
          await handleManualSync();
          await checkAchievementsAndNotify();
          useStore.getState().setPendingHealthToast({
            icon: '💚',
            title: 'Connecté à Santé Connect',
            subtitle: 'Tes calories brûlées sont maintenant synchronisées',
          });
        } else {
          Alert.alert(
            'Permission refusée',
            'Autorise LeanTrack à lire tes données Health Connect dans les paramètres.',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Ouvrir Santé Connect', onPress: () => openHealthConnectSettings() },
            ]
          );
        }
      } finally {
        setSyncingHealth(false);
      }
    } else {
      await setSetting('health_connect_enabled', '0');
      setHealthConnectEnabled(false);
      setCaloriesBurned(0);
    }
  }

  function confirmReset() {
    Alert.alert(
      '⚠️ Réinitialiser les données',
      'Toutes tes données (repas, eau, poids, succès) seront supprimées. Ton profil sera réinitialisé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer tout', style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmation finale',
              'Cette action est irréversible. Confirmes-tu la suppression de toutes tes données ?',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Oui, tout supprimer', style: 'destructive',
                  onPress: async () => {
                    const profileId = profile!.profile_id;
                    if (!profileId) return;
                    await resetAllData(profileId);
                    router.replace('/onboarding');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>⚙️ Mon profil</Text>
          <TouchableOpacity style={styles.profilesBtn} onPress={() => router.push('/profiles')}>
            <Text style={styles.profilesBtnText}>👤 Profils</Text>
          </TouchableOpacity>
        </View>

        {/* Identity card */}
        <Card style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{profile.gender === 'homme' ? '👨' : '👩'}</Text>
          </View>
          <Text style={styles.profileName}>{getProfileName(profile)}</Text>
          <Text style={styles.profileSub}>
            {profile.age} ans · {profile.height} cm · {profile.weight_current} kg
          </Text>
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText}>{GOAL_LABELS[profile.goal]}</Text>
          </View>
        </Card>

        {/* Stats */}
        <Card>
          <Text style={styles.sectionTitle}>Objectifs nutritionnels</Text>
          <InfoRow label="Calories cibles" value={`${profile.calorie_target} kcal/j`} />
          <View style={styles.divider} />
          <InfoRow label="Protéines" value={`${profile.protein_target} g/j`} />
          <View style={styles.divider} />
          <InfoRow label="Glucides" value={`${profile.carbs_target} g/j`} />
          <View style={styles.divider} />
          <InfoRow label="Lipides" value={`${profile.fat_target} g/j`} />
          <View style={styles.divider} />
          <InfoRow label="Eau" value={`${profile.water_target} ml/j`} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Infos personnelles</Text>
          <InfoRow label="TDEE" value={`${profile.tdee} kcal/j`} />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Activité</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.infoValue}>{ACTIVITY_LABELS[profile.activity_level]}</Text>
              <TouchableOpacity
                onPress={() => setActivityModalVisible(true)}
                style={styles.editInitialBtn}
              >
                <Text style={styles.editInitialBtnText}>Modifier</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.divider} />
          <InfoRow label="Poids cible" value={`${profile.weight_target} kg`} />
          <View style={styles.divider} />
          <InfoRow label="Date cible" value={profile.target_date} />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Poids de départ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.infoValue}>{profile.weight_initial ?? profile.weight_current} kg</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditWeightInitialInput(String(profile.weight_initial ?? profile.weight_current));
                  setEditWeightInitialVisible(true);
                }}
                style={styles.editInitialBtn}
              >
                <Text style={styles.editInitialBtnText}>Modifier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {/* Connexions */}
        <Card>
          <Text style={styles.sectionTitle}>Connexions</Text>
          <View style={styles.hcRow1}>
            <Text style={styles.hcIcon}>💚</Text>
            <Text style={styles.hcLabel}>Health Connect</Text>
            <View style={[styles.hcDot, healthConnectEnabled ? styles.hcDotOn : styles.hcDotOff]} />
          </View>
          <Text style={styles.hcStatusText}>
            {healthConnectEnabled
              ? `Connecté · ${caloriesBurned} kcal brûlées aujourd'hui`
              : 'Non connecté'}
          </Text>
          <View style={styles.hcActionRow}>
            <TouchableOpacity
              style={styles.editInitialBtn}
              disabled={syncingHealth}
              onPress={handleHealthConnectToggle}
            >
              <Text style={styles.editInitialBtnText}>
                {syncingHealth ? '...' : healthConnectEnabled ? 'Déconnecter' : 'Connecter'}
              </Text>
            </TouchableOpacity>
          </View>
          {healthConnectEnabled && (
            <TouchableOpacity
              style={styles.hcSyncLink}
              disabled={syncingHealth}
              onPress={handleManualSync}
            >
              <Text style={{ color: Colors.accent, fontSize: 13 }}>
                ↻ Synchroniser maintenant
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Weight tracking */}
        <Card style={styles.weightSection}>
          <View style={styles.weightSectionHeader}>
            <Text style={styles.sectionTitle}>📊 Suivi du poids</Text>
            <TouchableOpacity style={styles.addWeightBtn} onPress={openAddWeight}>
              <Text style={styles.addWeightBtnText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
          {weightEntries.length === 0 ? (
            <Text style={styles.noEntriesText}>Aucune pesée enregistrée</Text>
          ) : (
            weightEntries.slice(0, 10).map((entry) => (
              <View key={entry.date} style={styles.weightEntryRow}>
                <Text style={styles.weightEntryDate}>{entry.date}</Text>
                <Text style={styles.weightEntryValue}>{entry.weight} kg</Text>
                <TouchableOpacity onPress={() => openEditWeight(entry)} style={styles.weightAction}>
                  <Text style={styles.weightActionText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteWeight(entry.date)} style={styles.weightAction}>
                  <Text style={styles.weightActionText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Card>

        {/* Achievements */}
        <Card>
          <TouchableOpacity
            onPress={() => {
              setExpandedLevel(currentLevel.level);
              setLevelsModalVisible(true);
            }}
            activeOpacity={0.75}
            style={{ marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>
                Niveau {currentLevel.level} — {currentLevel.label} ›
              </Text>
              <Text style={{ color: '#fbbf24', fontWeight: '700', fontSize: 16 }}>⚡ {totalXP} XP</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.bgSurface, overflow: 'hidden' }}>
              <View style={{ height: '100%', borderRadius: 3, width: `${levelPct}%` as any, backgroundColor: '#fbbf24' }} />
            </View>
            {nextLevel ? (
              <Text style={{ color: Colors.textMuted, fontSize: 10, marginTop: 4 }}>
                {xpInLevel} / {xpNeeded} XP gagnés ce niveau → Niv. {nextLevel.level} {nextLevel.label}
              </Text>
            ) : (
              <Text style={{ color: '#fbbf24', fontSize: 10, marginTop: 4 }}>Niveau maximum atteint 🏆</Text>
            )}
          </TouchableOpacity>

          {/* Toggle accordéon */}
          <TouchableOpacity
            onPress={() => setRewardsExpanded((prev) => !prev)}
            activeOpacity={0.75}
            style={styles.rewardsToggle}
          >
            <Text style={styles.rewardsToggleLeft}>🏅 Mes récompenses</Text>
            <View style={styles.rewardsToggleRight}>
              <Text style={styles.rewardsToggleCount}>
                {unlockedIds.length} / {ALL_ACHIEVEMENTS.length}
              </Text>
              <Text style={styles.rewardsToggleChevron}>{rewardsExpanded ? '▲' : '▼'}</Text>
            </View>
          </TouchableOpacity>

          {rewardsExpanded && (
            <View style={{ marginTop: 12 }}>
              <AchievementGrid unlockedIds={unlockedIds} stats={achievementStats} />
            </View>
          )}
        </Card>

        {/* Notifications */}
        <Card>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <TouchableOpacity style={styles.notifRow} onPress={toggleNotifications}>
            <View>
              <Text style={styles.notifLabel}>Rappels actifs</Text>
              <Text style={styles.notifDesc}>Repas · Eau · Mouvement</Text>
            </View>
            <View style={[styles.toggle, profile.notifications_enabled && styles.toggleOn]}>
              <View style={[styles.toggleThumb, profile.notifications_enabled && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="✏️ Modifier mon profil"
            onPress={() => router.push('/onboarding')}
            variant="ghost"
          />
          <Button
            label="🗑️ Réinitialiser toutes mes données"
            onPress={confirmReset}
            variant="ghost"
          />
        </View>

        <View style={{ height: BOTTOM_SPACER_HEIGHT }} />

        {/* Weight modal */}
        <KeyboardAwareModal visible={weightModal} onClose={() => setWeightModal(false)}>
          <Text style={styles.weightTitle}>⚖️ Enregistrer un poids</Text>
          <View style={styles.weightFormField}>
            <Text style={styles.weightFormLabel}>Date (AAAA-MM-JJ)</Text>
            <TextInput
              style={styles.weightInput}
              value={weightDate}
              onChangeText={setWeightDate}
              placeholder="2025-01-15"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.weightFormField}>
            <Text style={styles.weightFormLabel}>Poids (kg)</Text>
            <TextInput
              style={styles.weightInput}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder="72.5"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
          </View>
          <View style={styles.weightBtns}>
            <Button label="Annuler" onPress={() => setWeightModal(false)} variant="ghost" />
            <View style={{ flex: 1 }}>
              <Button label="Enregistrer" onPress={saveWeight} loading={saving} />
            </View>
          </View>
        </KeyboardAwareModal>
      </ScrollView>

      {/* Levels glossary modal */}
      <Modal
        visible={levelsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLevelsModalVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setLevelsModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1}>
            <View style={[styles.levelsSheet, { maxHeight: SCREEN_H * 0.78 }]}>
              <View style={styles.levelsHandle} />
              <Text style={styles.levelsTitle}>⚡ Tous les niveaux</Text>
              <Text style={styles.levelsCurrentXp}>Tu as actuellement {totalXP} XP</Text>
              <ScrollView style={{ maxHeight: SCREEN_H * 0.55 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {XP_LEVELS.map((lvl, i) => {
                  const isPast = totalXP > lvl.max;
                  const isCurrent = lvl.level === currentLevel.level;
                  const isFuture = lvl.min > totalXP;
                  const isExpanded = expandedLevel === lvl.level;
                  const feature = LEVEL_FEATURES.find((f) => f.level === lvl.level);
                  const xpMissing = Math.max(lvl.min - totalXP, 0);
                  return (
                    <TouchableOpacity
                      key={lvl.level}
                      activeOpacity={0.75}
                      onPress={() => toggleLevelExpanded(lvl.level)}
                      style={[styles.levelRow, isCurrent && styles.levelRowCurrent]}
                    >
                      <View style={[
                        styles.levelDot,
                        isPast && styles.levelDotPast,
                        isCurrent && styles.levelDotCurrent,
                        isFuture && styles.levelDotFuture,
                      ]}>
                        <Text style={{ fontSize: 12 }}>{isPast ? '✅' : isCurrent ? '⚡' : '🔒'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[
                            styles.levelName,
                            isPast && styles.levelNamePast,
                            isCurrent && styles.levelNameCurrent,
                            isFuture && styles.levelNameFuture,
                          ]}>
                            Niv. {lvl.level} — {lvl.label}
                          </Text>
                          <Text style={[styles.levelXpRange, isCurrent && { color: '#fbbf24' }, isPast && { color: Colors.accent }]}>
                            {lvl.level < 7 ? `${lvl.min} XP` : `${lvl.min}+ XP`}
                          </Text>
                        </View>
                        {!!feature && (
                          <Text style={styles.levelSummary}>{feature.summary}</Text>
                        )}
                        {isCurrent && (
                          <View style={{ marginTop: 6 }}>
                            <View style={styles.levelCurrentBar}>
                              <View style={[styles.levelCurrentFill, { width: `${levelPct}%` as any }]} />
                            </View>
                            <Text style={styles.levelCurrentProgress}>
                              {xpInLevel} / {xpNeeded} XP gagnés ce niveau (vers {XP_LEVELS[i + 1]?.label ?? '🏆'})
                            </Text>
                          </View>
                        )}
                        {isExpanded && !!feature && (
                          <View style={styles.levelDetailPanel}>
                            <Text style={styles.levelDetailText}>{feature.detail}</Text>
                            <View style={[
                              styles.levelStatusBadge,
                              isPast && styles.levelStatusBadgeUnlocked,
                              isCurrent && styles.levelStatusBadgeCurrent,
                              isFuture && styles.levelStatusBadgeLocked,
                            ]}>
                              <Text style={styles.levelStatusBadgeText}>
                                {isCurrent ? '⚡ Niveau actuel' : isPast ? '✅ Débloqué' : `🔒 Débloqué au niveau ${lvl.level}`}
                              </Text>
                            </View>
                            {isFuture && (
                              <Text style={styles.levelXpMissing}>
                                Il te manque {xpMissing} XP pour débloquer cette fonctionnalité
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity onPress={() => setLevelsModalVisible(false)} style={styles.levelsClose}>
                <Text style={styles.levelsCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Activity level modal */}
      <Modal
        visible={activityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setActivityModalVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setActivityModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.levelsSheet}>
              <View style={styles.levelsHandle} />
              <Text style={styles.levelsTitle}>🏃 Niveau d'activité</Text>
              <Text style={styles.levelsCurrentXp}>Choisis ton niveau d'activité physique</Text>
              {ACTIVITY_OPTIONS.map((opt) => {
                const isSelected = opt.value === profile.activity_level;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.75}
                    disabled={updatingActivity}
                    onPress={() => handleActivityChange(opt.value)}
                    style={[styles.activityOption, isSelected && styles.activityOptionSelected]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityOptionLabel, isSelected && { color: Colors.accent }]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.activityOptionDesc}>{opt.desc}</Text>
                    </View>
                    {isSelected && <Text style={styles.activityCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Poids de départ modal */}
      <KeyboardAwareModal
        visible={editWeightInitialVisible}
        onClose={() => setEditWeightInitialVisible(false)}
      >
        <Text style={{ color: Colors.textPrimary, fontWeight: '700', fontSize: 18, marginBottom: 8 }}>
          🏁 Poids de départ
        </Text>
        <Text style={{ color: Colors.textMuted, fontSize: 13, marginBottom: 16 }}>
          Ton poids au début de LeanTrack. Sert à calculer ta progression réelle.
        </Text>
        <TextInput
          style={[styles.weightInput, { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 20 }]}
          value={editWeightInitialInput}
          onChangeText={setEditWeightInitialInput}
          keyboardType="decimal-pad"
          placeholder="Ex: 110"
          placeholderTextColor={Colors.textMuted}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => setEditWeightInitialVisible(false)}
            style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.bgElevated, alignItems: 'center' }}
          >
            <Text style={{ color: Colors.textSecondary }}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={saving}
            onPress={async () => {
              const w = parseFloat(editWeightInitialInput.replace(',', '.'));
              if (isNaN(w) || w < 20 || w > 500) return;
              setSaving(true);
              try {
                await updateWeightInitial(w);
                const updated = await getProfile();
                if (updated) {
                  setProfile(updated);
                  useStore.getState().setProfile(updated);
                }
                setEditWeightInitialVisible(false);
              } finally {
                setSaving(false);
              }
            }}
            style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center', opacity: saving ? 0.5 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? '...' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareModal>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 12, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  profilesBtn: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radiusPill,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.border,
  },
  profilesBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  emptyText: { fontSize: 18, color: Colors.textSecondary },
  identityCard: { alignItems: 'center', gap: 8 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 36 },
  profileName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  profileSub: { fontSize: 14, color: Colors.textSecondary },
  goalBadge: {
    backgroundColor: Colors.accentSubtle,
    borderRadius: Colors.radiusPill,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  goalBadgeText: { color: Colors.accent, fontWeight: '600', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  achievementsCount: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, marginTop: -6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.bgElevated },
  hcRow1: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingBottom: 0 },
  hcIcon: { fontSize: 18 },
  hcLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  hcDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },
  hcDotOn: { backgroundColor: Colors.accent },
  hcDotOff: { backgroundColor: Colors.textMuted },
  hcStatusText: { fontSize: 13, color: Colors.textSecondary, paddingTop: 4, paddingBottom: 12 },
  hcActionRow: { alignItems: 'flex-end' },
  hcSyncLink: { marginTop: 12, alignSelf: 'flex-end' },
  weightSection: { gap: 0 },
  weightSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  addWeightBtn: {
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radiusPill,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  addWeightBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 13 },
  noEntriesText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  weightEntryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.bgElevated,
  },
  weightEntryDate: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  weightEntryValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginRight: 4 },
  weightAction: { padding: 6 },
  weightActionText: { fontSize: 15 },
  notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  notifDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  toggle: {
    width: 50, height: 28, borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Colors.accent },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  editInitialBtn: {
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radiusPill,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.accent,
  },
  editInitialBtnText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },
  activityOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  activityOptionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  activityOptionLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  activityOptionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  activityCheck: { fontSize: 18, fontWeight: '700', color: Colors.accent, marginLeft: 10 },
  actions: { gap: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  weightCard: { width: '85%', gap: 16 },
  weightTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  weightFormField: { gap: 6 },
  weightFormLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  weightInput: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 18, padding: 12, textAlign: 'center', fontWeight: '600',
  },
  weightBtns: { flexDirection: 'row', gap: 10 },
  levelsSheet: { backgroundColor: Colors.bgSurface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 48 },
  levelsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, alignSelf: 'center', marginBottom: 16 },
  levelsTitle: { color: Colors.textPrimary, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  levelsCurrentXp: { color: Colors.textMuted, fontSize: 12, marginBottom: 16 },
  levelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  levelRowCurrent: { backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8, borderBottomColor: 'transparent' },
  levelDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgPrimary, borderWidth: 1, borderColor: Colors.border, marginTop: 2 },
  levelDotPast: { backgroundColor: 'rgba(34, 106, 76,0.1)', borderColor: Colors.accent },
  levelDotCurrent: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: '#fbbf24' },
  levelDotFuture: { opacity: 0.4 },
  levelName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  levelNamePast: { color: Colors.accent },
  levelNameCurrent: { color: '#fbbf24', fontWeight: '800' },
  levelNameFuture: { color: Colors.textMuted },
  levelXpRange: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  levelCurrentBar: { height: 4, borderRadius: 2, backgroundColor: Colors.bgPrimary, overflow: 'hidden' },
  levelCurrentFill: { height: '100%', borderRadius: 2, backgroundColor: '#fbbf24' },
  levelCurrentProgress: { color: Colors.textMuted, fontSize: 10, marginTop: 3 },
  levelSummary: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 3 },
  levelDetailPanel: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  levelDetailText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  levelStatusBadge: {
    alignSelf: 'flex-start', borderRadius: Colors.radiusPill,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  levelStatusBadgeUnlocked: { backgroundColor: 'rgba(34, 106, 76,0.1)', borderColor: Colors.accent },
  levelStatusBadgeCurrent: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: '#fbbf24' },
  levelStatusBadgeLocked: { backgroundColor: 'rgba(112, 121, 115,0.1)', borderColor: Colors.textMuted },
  levelStatusBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  levelXpMissing: { color: Colors.textMuted, fontSize: 12 },
  levelsClose: { marginTop: 20, backgroundColor: Colors.accent, borderRadius: 14, padding: 14, alignItems: 'center' },
  levelsCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rewardsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.bgPrimary, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  rewardsToggleLeft: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  rewardsToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardsToggleCount: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  rewardsToggleChevron: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
});
