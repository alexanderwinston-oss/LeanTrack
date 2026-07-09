import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Dimensions, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AchievementGrid, ALL_ACHIEVEMENTS } from '@/components/Achievements';
import { useStore } from '@/lib/store';
import {
  checkAndUnlockAchievements, deleteWeightEntry, getAllWeightEntries,
  getAchievementStats, getProfile, getUnlockedAchievements, resetAllData, saveProfile,
  updateWeightEntry, updateWeightInitial,
} from '@/lib/db';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { cancelAllNotifications, scheduleAllNotifications } from '@/lib/notifications';
import { AchievementStats, WeightEntry } from '@/lib/types';

const XP_LEVELS = [
  { level: 1, label: 'Débutant',   min: 0,    max: 149   },
  { level: 2, label: 'En route',   min: 150,  max: 399   },
  { level: 3, label: 'Régulier',   min: 400,  max: 799   },
  { level: 4, label: 'Confirmé',   min: 800,  max: 1499  },
  { level: 5, label: 'Discipliné', min: 1500, max: 2499  },
  { level: 6, label: 'Expert',     min: 2500, max: 3999  },
  { level: 7, label: 'Élite',      min: 4000, max: 99999 },
];

function getLevel(xp: number) {
  return XP_LEVELS.find((l) => xp >= l.min && xp <= l.max) ?? XP_LEVELS[XP_LEVELS.length - 1];
}
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { registerModal } from '@/lib/useModalManager';
import { getLocalDateString, getProfileName } from '@/lib/utils';

const SCREEN_H = Dimensions.get('window').height;

const ACTIVITY_LABELS: Record<string, string> = {
  sedentaire: 'Sédentaire',
  leger: 'Léger',
  modere: 'Modéré',
  actif: 'Actif',
  tres_actif: 'Très actif',
};

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
  const [weightModal, setWeightModal] = useState(false);
  const [weightDate, setWeightDate] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const setPendingBadge = useStore((s) => s.setPendingBadge);
  const [saving, setSaving] = useState(false);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [achievementStats, setAchievementStats] = useState<AchievementStats | null>(null);
  const [editWeightInitialVisible, setEditWeightInitialVisible] = useState(false);
  const [editWeightInitialInput, setEditWeightInitialInput] = useState('');
  const [levelsModalVisible, setLevelsModalVisible] = useState(false);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);

  registerModal('profilWeight', weightModal, () => setWeightModal(false), 10);
  registerModal('profilEditInitial', editWeightInitialVisible, () => setEditWeightInitialVisible(false), 5);
  registerModal('levelsGlossary', levelsModalVisible, () => setLevelsModalVisible(false), 5);

  useFocusEffect(
    useCallback(() => {
      getUnlockedAchievements().then(setUnlockedIds);
      loadWeightEntries();
      if (profile) {
        getAchievementStats(profile).then(setAchievementStats).catch(() => {});
        checkAndUnlockAchievements(profile).then((newOnes) => {
          if (newOnes.length > 0) {
            newOnes.forEach((b) => setPendingBadge(b));
            getUnlockedAchievements().then(setUnlockedIds);
          }
        }).catch(() => {});
      }
    }, [profile])
  );

  async function loadWeightEntries() {
    const entries = await getAllWeightEntries();
    setWeightEntries(entries);
  }

  const totalXP = useMemo(
    () => ALL_ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id)).reduce((sum, a) => sum + a.xp, 0),
    [unlockedIds]
  );
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
        const newOnes = await checkAndUnlockAchievements(updated);
        if (newOnes.length > 0) {
          newOnes.forEach((b) => setPendingBadge(b));
          getUnlockedAchievements().then(setUnlockedIds);
        }
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
          <InfoRow label="Activité" value={ACTIVITY_LABELS[profile.activity_level]} />
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
            onPress={() => setLevelsModalVisible(true)}
            activeOpacity={0.75}
            style={{ marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700' }}>
                Niveau {currentLevel.level} — {currentLevel.label} ›
              </Text>
              <Text style={{ color: '#fbbf24', fontWeight: '700', fontSize: 16 }}>⚡ {totalXP} XP</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#1e293b', overflow: 'hidden' }}>
              <View style={{ height: '100%', borderRadius: 3, width: `${levelPct}%` as any, backgroundColor: '#fbbf24' }} />
            </View>
            {nextLevel ? (
              <Text style={{ color: '#475569', fontSize: 10, marginTop: 4 }}>
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
                  return (
                    <View key={lvl.level} style={[styles.levelRow, isCurrent && styles.levelRowCurrent]}>
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
                          <Text style={[styles.levelXpRange, isCurrent && { color: '#fbbf24' }, isPast && { color: '#10b981' }]}>
                            {lvl.level < 7 ? `${lvl.min} XP` : `${lvl.min}+ XP`}
                          </Text>
                        </View>
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
                      </View>
                    </View>
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

      {/* Poids de départ modal */}
      <KeyboardAwareModal
        visible={editWeightInitialVisible}
        onClose={() => setEditWeightInitialVisible(false)}
      >
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>
          🏁 Poids de départ
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
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
            style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center' }}
          >
            <Text style={{ color: '#94a3b8' }}>Annuler</Text>
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
            style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center', opacity: saving ? 0.5 : 1 }}
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
  levelsSheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 48 },
  levelsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginBottom: 16 },
  levelsTitle: { color: '#f1f5f9', fontWeight: '800', fontSize: 18, marginBottom: 4 },
  levelsCurrentXp: { color: '#64748b', fontSize: 12, marginBottom: 16 },
  levelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  levelRowCurrent: { backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8, borderBottomColor: 'transparent' },
  levelDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', marginTop: 2 },
  levelDotPast: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: '#10b981' },
  levelDotCurrent: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: '#fbbf24' },
  levelDotFuture: { opacity: 0.4 },
  levelName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  levelNamePast: { color: '#10b981' },
  levelNameCurrent: { color: '#fbbf24', fontWeight: '800' },
  levelNameFuture: { color: '#475569' },
  levelXpRange: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  levelCurrentBar: { height: 4, borderRadius: 2, backgroundColor: '#0f172a', overflow: 'hidden' },
  levelCurrentFill: { height: '100%', borderRadius: 2, backgroundColor: '#fbbf24' },
  levelCurrentProgress: { color: '#64748b', fontSize: 10, marginTop: 3 },
  levelsClose: { marginTop: 20, backgroundColor: '#10b981', borderRadius: 14, padding: 14, alignItems: 'center' },
  levelsCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rewardsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  rewardsToggleLeft: { color: '#f1f5f9', fontWeight: '700', fontSize: 14 },
  rewardsToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardsToggleCount: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  rewardsToggleChevron: { color: '#10b981', fontSize: 12, fontWeight: '700' },
});
