import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { calcFullProfile } from '@/lib/nutrition';
import { saveProfile } from '@/lib/db';
import { requestPermissions, scheduleAllNotifications } from '@/lib/notifications';
import { useStore } from '@/lib/store';
import { ActivityLevel, Goal } from '@/lib/types';
import { getLocalDateString } from '@/lib/utils';

const TOTAL_STEPS = 6;

const ACTIVITY_OPTIONS: { key: ActivityLevel; label: string; desc: string }[] = [
  { key: 'sedentaire', label: 'Sédentaire', desc: 'Peu ou pas d\'exercice, travail de bureau' },
  { key: 'leger', label: 'Léger', desc: '1-3 jours d\'exercice par semaine' },
  { key: 'modere', label: 'Modéré', desc: '3-5 jours d\'exercice par semaine' },
  { key: 'actif', label: 'Actif', desc: '6-7 jours d\'exercice intense par semaine' },
  { key: 'tres_actif', label: 'Très actif', desc: 'Travail physique intense + sport quotidien' },
];

const DURATION_OPTIONS = [
  { label: '1 mois', months: 1 },
  { label: '3 mois', months: 3 },
  { label: '6 mois', months: 6 },
];

const GOAL_OPTIONS: { key: Goal; label: string; emoji: string }[] = [
  { key: 'perte', label: 'Perdre du poids', emoji: '📉' },
  { key: 'maintien', label: 'Maintenir mon poids', emoji: '⚖️' },
  { key: 'prise', label: 'Prendre du poids', emoji: '📈' },
];

function Input({ label, value, onChangeText, keyboardType = 'default', placeholder }: any) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder ?? ''}
        placeholderTextColor={Colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

export default function Onboarding() {
  const setProfile = useStore((s) => s.setProfile);
  const switchProfileInStore = useStore((s) => s.switchProfileInStore);
  const params = useLocalSearchParams();
  const isNewProfile = params.mode === 'new_profile';
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'homme' | 'femme'>('homme');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weightCurrent, setWeightCurrent] = useState('');
  const [weightTarget, setWeightTarget] = useState('');
  const [durationMonths, setDurationMonths] = useState(3);
  const [goal, setGoal] = useState<Goal>('perte');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('modere');
  const [notifEnabled, setNotifEnabled] = useState(true);

  const progressWidth = useSharedValue(1 / TOTAL_STEPS);
  const animStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  function nextStep() {
    const next = step + 1;
    progressWidth.value = withTiming(next / TOTAL_STEPS, { duration: 300 });
    setStep(next);
  }

  function prevStep() {
    const prev = step - 1;
    progressWidth.value = withTiming(prev / TOTAL_STEPS, { duration: 300 });
    setStep(prev);
  }

  function getTargetDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + durationMonths);
    return getLocalDateString(d);
  }

  function getCalculated() {
    const w = parseFloat(weightCurrent) || 70;
    const wt = parseFloat(weightTarget) || 65;
    const h = parseFloat(height) || 170;
    const a = parseInt(age) || 30;
    return calcFullProfile({
      name, age: a, gender, weight_current: w, weight_target: wt,
      height: h, activity_level: activityLevel, goal, target_date: getTargetDate(),
    });
  }

  async function finish() {
    setSaving(true);
    try {
      const calc = getCalculated();
      const profileData = {
        ...calc,
        notifications_enabled: notifEnabled,
        onboarding_completed: true,
      };

      if (isNewProfile) {
        // Forcer un INSERT en passant un nouvel ID — jamais d'UPDATE sur le profil actif
        const newProfileId = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await saveProfile({ ...profileData, profile_id: newProfileId });
        await switchProfileInStore(newProfileId);
        router.replace('/profiles');
      } else {
        await saveProfile(profileData);
        setProfile(profileData as UserProfile);
        if (notifEnabled) {
          await requestPermissions();
          await scheduleAllNotifications({ notifications_enabled: true });
        }
        router.replace('/(tabs)');
      }
    } finally {
      setSaving(false);
    }
  }

  const calc = step === 5 ? getCalculated() : null;

  const weeksEstimated = calc
    ? Math.abs(Math.round(
        ((parseFloat(weightCurrent) || 70) - (parseFloat(weightTarget) || 65)) * 7700 /
        (Math.abs(calc.tdee - calc.calorie_target) * 7 || 500)
      ))
    : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, animStyle]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Step 1: Name */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.title}>Bienvenue sur LeanTrack</Text>
            <Text style={styles.subtitle}>Comment tu t'appelles ?</Text>
            <Input label="Prénom" value={name} onChangeText={setName} placeholder="Ton prénom" />
          </View>
        )}

        {/* Step 2: Bio */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>📏</Text>
            <Text style={styles.title}>Ton profil</Text>
            <Text style={styles.subtitle}>Ces données servent à calculer tes besoins</Text>

            <View style={styles.toggleRow}>
              {(['homme', 'femme'] as const).map((g) => (
                <Pressable
                  key={g}
                  style={[styles.toggleBtn, gender === g && styles.toggleBtnActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.toggleText, gender === g && styles.toggleTextActive]}>
                    {g === 'homme' ? '👨 Homme' : '👩 Femme'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Input label="Âge (ans)" value={age} onChangeText={setAge} keyboardType="numeric" placeholder="25" />
            <Input label="Taille (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="175" />
            <Input label="Poids actuel (kg)" value={weightCurrent} onChangeText={setWeightCurrent} keyboardType="decimal-pad" placeholder="75" />
          </View>
        )}

        {/* Step 3: Goal */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🎯</Text>
            <Text style={styles.title}>Ton objectif</Text>

            <Input label="Poids cible (kg)" value={weightTarget} onChangeText={setWeightTarget} keyboardType="decimal-pad" placeholder="70" />

            <Text style={styles.sectionLabel}>Durée</Text>
            <View style={styles.toggleRow}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d.months}
                  style={[styles.toggleBtn, durationMonths === d.months && styles.toggleBtnActive]}
                  onPress={() => setDurationMonths(d.months)}
                >
                  <Text style={[styles.toggleText, durationMonths === d.months && styles.toggleTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Objectif</Text>
            <View style={styles.goalGrid}>
              {GOAL_OPTIONS.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.goalCard, goal === g.key && styles.goalCardActive]}
                  onPress={() => setGoal(g.key)}
                >
                  <Text style={styles.goalEmoji}>{g.emoji}</Text>
                  <Text style={[styles.goalLabel, goal === g.key && styles.goalLabelActive]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 4: Activity */}
        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🏃</Text>
            <Text style={styles.title}>Niveau d'activité</Text>
            <Text style={styles.subtitle}>Sois honnête — ça impacte tes calories</Text>
            <View style={styles.activityList}>
              {ACTIVITY_OPTIONS.map((a) => (
                <Pressable
                  key={a.key}
                  style={[styles.activityCard, activityLevel === a.key && styles.activityCardActive]}
                  onPress={() => setActivityLevel(a.key)}
                >
                  <Text style={[styles.activityLabel, activityLevel === a.key && styles.activityLabelActive]}>
                    {a.label}
                  </Text>
                  <Text style={styles.activityDesc}>{a.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 5: Summary */}
        {step === 5 && calc && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>📊</Text>
            <Text style={styles.title}>Ton plan personnalisé</Text>

            <View style={styles.summaryGrid}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryNum}>{Math.round(calc.tdee)}</Text>
                <Text style={styles.summaryLbl}>TDEE (kcal/j)</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryNum, { color: Colors.accent }]}>{Math.round(calc.calorie_target)}</Text>
                <Text style={styles.summaryLbl}>Objectif kcal/j</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryNum, { color: Colors.proteinColor }]}>{calc.protein_target}g</Text>
                <Text style={styles.summaryLbl}>Protéines</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryNum, { color: Colors.carbsColor }]}>{calc.carbs_target}g</Text>
                <Text style={styles.summaryLbl}>Glucides</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryNum, { color: Colors.fatColor }]}>{calc.fat_target}g</Text>
                <Text style={styles.summaryLbl}>Lipides</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryNum, { color: Colors.waterColor }]}>{calc.water_target}ml</Text>
                <Text style={styles.summaryLbl}>Eau/jour</Text>
              </Card>
            </View>

            <Card style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={styles.projectionText}>
                Objectif atteint estimé en{' '}
                <Text style={{ color: Colors.accent, fontWeight: '700' }}>{weeksEstimated} semaines</Text>
              </Text>
            </Card>
          </View>
        )}

        {/* Step 6: Notifications */}
        {step === 6 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🔔</Text>
            <Text style={styles.title}>Rappels & notifications</Text>
            <Text style={styles.subtitle}>LeanTrack peut t'envoyer des rappels pour rester sur la bonne voie</Text>

            <TouchableOpacity
              style={[styles.notifToggle, notifEnabled && styles.notifToggleActive]}
              onPress={() => setNotifEnabled(!notifEnabled)}
            >
              <View>
                <Text style={styles.notifTitle}>Activer les notifications</Text>
                <Text style={styles.notifDesc}>Repas · Eau · Mouvement</Text>
              </View>
              <View style={[styles.toggle, notifEnabled && styles.toggleOn]}>
                <View style={[styles.toggleThumb, notifEnabled && styles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>

            <View style={styles.reminderList}>
              {['🥣 Rappels repas (8h, 12h30, 19h30)', '💧 Hydratation toutes les 2h', '🚶 Mouvement toutes les 2h'].map((r) => (
                <View key={r} style={styles.reminderItem}>
                  <Text style={styles.reminderText}>{r}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navRow}>
        {step > 1 && (
          <Button label="Retour" onPress={prevStep} variant="ghost" />
        )}
        <View style={{ flex: 1 }}>
          {step < TOTAL_STEPS ? (
            <Button label="Suivant →" onPress={nextStep} />
          ) : (
            <Button label="Commencer 🚀" onPress={finish} loading={saving} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.bgElevated,
    marginTop: 50,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  scroll: { padding: 24, paddingBottom: 40 },
  stepContent: { gap: 16 },
  emoji: { fontSize: 48, textAlign: 'center', marginTop: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  input: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 16,
    padding: 14,
  },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: Colors.radius,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  toggleBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  toggleText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 15 },
  toggleTextActive: { color: Colors.accent },
  sectionLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', marginTop: 8 },
  goalGrid: { gap: 10 },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Colors.radius,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
  },
  goalCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  goalEmoji: { fontSize: 24 },
  goalLabel: { fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },
  goalLabelActive: { color: Colors.accent },
  activityList: { gap: 10 },
  activityCard: {
    padding: 14,
    borderRadius: Colors.radius,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
    gap: 4,
  },
  activityCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  activityLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  activityLabelActive: { color: Colors.accent },
  activityDesc: { fontSize: 13, color: Colors.textSecondary },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { flex: 1, minWidth: '44%', alignItems: 'center', gap: 4 },
  summaryNum: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  summaryLbl: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  projectionText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  notifToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: Colors.radius,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
  },
  notifToggleActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  notifTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  notifDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  toggle: {
    width: 50, height: 28, borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Colors.accent },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  reminderList: { gap: 8 },
  reminderItem: {
    padding: 12,
    borderRadius: Colors.radius,
    backgroundColor: Colors.bgSurface,
  },
  reminderText: { color: Colors.textSecondary, fontSize: 14 },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
  },
});
