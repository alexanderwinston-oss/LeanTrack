import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AchievementGrid, CelebrationModal } from '@/components/Achievements';
import { useStore } from '@/lib/store';
import { checkAndUnlockAchievements, getUnlockedAchievements, logWeight, saveProfile } from '@/lib/db';
import { cancelAllNotifications, scheduleAllNotifications } from '@/lib/notifications';

const TODAY = new Date().toISOString().split('T')[0];

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
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [celebrationId, setCelebrationId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getUnlockedAchievements().then(setUnlockedIds);
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

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Profil non configuré</Text>
          <Button label="Créer mon profil" onPress={() => router.replace('/onboarding')} />
        </View>
      </SafeAreaView>
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

  async function saveWeight() {
    const w = parseFloat(weightInput);
    if (!w || w < 20 || w > 500) {
      Alert.alert('Erreur', 'Poids invalide');
      return;
    }
    setSaving(true);
    try {
      await logWeight(TODAY, w);
      const updated = { ...profile, weight_current: w } as NonNullable<typeof profile>;
      await saveProfile(updated);
      setProfile(updated);
      setWeightModal(false);
      setWeightInput('');
      // Check achievements after weight update
      const newOnes = await checkAndUnlockAchievements(updated);
      if (newOnes.length > 0) {
        setCelebrationId(newOnes[0]);
        getUnlockedAchievements().then(setUnlockedIds);
      }
      Alert.alert('✅', `Poids enregistré : ${w} kg`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>⚙️ Mon profil</Text>
        </View>

        {/* Identity card */}
        <Card style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{profile.gender === 'homme' ? '👨' : '👩'}</Text>
          </View>
          <Text style={styles.profileName}>{profile.name}</Text>
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
            label="⚖️ Enregistrer mon poids"
            onPress={() => { setWeightInput(String(profile.weight_current)); setWeightModal(true); }}
            variant="secondary"
          />
          <Button
            label="✏️ Modifier mon profil"
            onPress={() => router.push('/onboarding')}
            variant="ghost"
          />
        </View>

        {/* Weight modal */}
        <Modal visible={weightModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <Card style={styles.weightCard}>
              <Text style={styles.weightTitle}>⚖️ Mon poids aujourd'hui</Text>
              <TextInput
                style={styles.weightInput}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="Poids en kg"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 12, gap: 16, paddingBottom: 80 },
  header: { marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
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
  weightCard: { width: '80%', gap: 16 },
  weightTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  weightInput: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 24, padding: 14, textAlign: 'center', fontWeight: '700',
  },
  weightBtns: { flexDirection: 'row', gap: 10 },
});
