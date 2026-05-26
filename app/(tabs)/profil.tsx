import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AchievementGrid, CelebrationModal } from '@/components/Achievements';
import { useStore } from '@/lib/store';
import {
  checkAndUnlockAchievements, deleteWeightEntry, getAllWeightEntries,
  getUnlockedAchievements, resetAllData, saveProfile, updateWeightEntry,
} from '@/lib/db';
import { cancelAllNotifications, scheduleAllNotifications } from '@/lib/notifications';
import { WeightEntry } from '@/lib/types';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { getProfileName } from '@/lib/utils';

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
  const [saving, setSaving] = useState(false);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [celebrationId, setCelebrationId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getUnlockedAchievements().then(setUnlockedIds);
      loadWeightEntries();
      if (profile) {
        checkAndUnlockAchievements(profile).then((newOnes) => {
          if (newOnes.length > 0) {
            setCelebrationId(newOnes[0]);
            getUnlockedAchievements().then(setUnlockedIds);
          }
        });
      }
    }, [profile])
  );

  async function loadWeightEntries() {
    const entries = await getAllWeightEntries();
    setWeightEntries(entries);
  }

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
    setWeightDate(new Date().toISOString().split('T')[0]);
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
      const today = new Date().toISOString().split('T')[0];
      if (weightDate === today) {
        const updated = { ...profile, weight_current: w } as NonNullable<typeof profile>;
        await saveProfile(updated);
        setProfile(updated);
        const newOnes = await checkAndUnlockAchievements(updated);
        if (newOnes.length > 0) {
          setCelebrationId(newOnes[0]);
          getUnlockedAchievements().then(setUnlockedIds);
        }
      }
      setWeightModal(false);
      setWeightInput('');
      setWeightDate('');
      await loadWeightEntries();
      Alert.alert('✅', `Poids enregistré : ${w} kg`);
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
          <Text style={styles.sectionTitle}>Mes récompenses</Text>
          <Text style={styles.achievementsCount}>
            {unlockedIds.length} / 10 paliers débloqués
          </Text>
          <AchievementGrid unlockedIds={unlockedIds} />
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
        <Modal visible={weightModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <Card style={styles.weightCard}>
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
            </Card>
          </View>
        </Modal>
      </ScrollView>

      {/* Achievement celebration modal */}
      <CelebrationModal
        achievementId={celebrationId}
        onClose={() => setCelebrationId(null)}
      />
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
});
