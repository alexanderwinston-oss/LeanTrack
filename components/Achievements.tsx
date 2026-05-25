import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';

export interface AchievementDef {
  id: string;
  emoji: string;
  label: string;
  description: string;
  category: 'eau' | 'calories' | 'poids';
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Eau
  { id: 'water_first',        emoji: '💧', label: 'Première gorgée',    description: 'Première entrée eau enregistrée',         category: 'eau' },
  { id: 'water_goal_1',       emoji: '🌊', label: 'Bien hydraté(e)',     description: 'Objectif eau atteint au moins 1 fois',    category: 'eau' },
  { id: 'water_hydro_master', emoji: '🏆', label: 'Hydro Master',        description: 'Objectif eau atteint 7 jours de suite',   category: 'eau' },
  // Calories
  { id: 'meal_first',             emoji: '🍎', label: 'Premier repas',      description: 'Premier aliment enregistré',              category: 'calories' },
  { id: 'calories_perfect_week',  emoji: '⭐', label: 'Semaine parfaite',   description: 'Objectif calorique respecté 7 jours',     category: 'calories' },
  { id: 'streak_30',              emoji: '🔥', label: '30 jours',           description: 'Streak de 30 jours consécutifs',          category: 'calories' },
  // Poids
  { id: 'weight_first',    emoji: '📊', label: 'Premier pas',        description: 'Premier poids saisi',                    category: 'poids' },
  { id: 'weight_1kg',      emoji: '💪', label: '-1 kg',              description: 'Perte (ou gain) de 1 kg',                category: 'poids' },
  { id: 'weight_halfway',  emoji: '🎯', label: 'Mi-chemin',          description: '50% de l\'objectif atteint',             category: 'poids' },
  { id: 'weight_goal',     emoji: '🏆', label: 'Objectif atteint !', description: 'Poids cible atteint',                    category: 'poids' },
];

interface BadgeProps {
  def: AchievementDef;
  unlocked: boolean;
}

function Badge({ def, unlocked }: BadgeProps) {
  return (
    <View style={[styles.badge, unlocked && styles.badgeUnlocked]}>
      <Text style={[styles.badgeEmoji, !unlocked && styles.badgeLocked]}>{def.emoji}</Text>
      <Text style={[styles.badgeLabel, !unlocked && styles.textLocked]} numberOfLines={2}>{def.label}</Text>
    </View>
  );
}

interface AchievementGridProps {
  unlockedIds: string[];
}

export function AchievementGrid({ unlockedIds }: AchievementGridProps) {
  const categories: { key: AchievementDef['category']; label: string }[] = [
    { key: 'eau', label: '💧 Hydratation' },
    { key: 'calories', label: '🍽️ Nutrition' },
    { key: 'poids', label: '⚖️ Poids' },
  ];

  return (
    <View style={styles.grid}>
      {categories.map(({ key, label }) => (
        <View key={key} style={styles.category}>
          <Text style={styles.categoryLabel}>{label}</Text>
          <View style={styles.badgeRow}>
            {ACHIEVEMENT_DEFS.filter((d) => d.category === key).map((def) => (
              <Badge key={def.id} def={def} unlocked={unlockedIds.includes(def.id)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

interface CelebrationModalProps {
  achievementId: string | null;
  onClose: () => void;
}

export function CelebrationModal({ achievementId, onClose }: CelebrationModalProps) {
  const scale = useRef(new Animated.Value(0.3)).current;
  const def = ACHIEVEMENT_DEFS.find((d) => d.id === achievementId);

  useEffect(() => {
    if (achievementId) {
      scale.setValue(0.3);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [achievementId]);

  if (!def) return null;

  return (
    <Modal visible={!!achievementId} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.celebCard, { transform: [{ scale }] }]}>
          <Text style={styles.celebEmoji}>{def.emoji}</Text>
          <Text style={styles.celebTitle}>Palier débloqué !</Text>
          <Text style={styles.celebLabel}>{def.label}</Text>
          <Text style={styles.celebDesc}>{def.description}</Text>
          <Pressable style={styles.celebBtn} onPress={onClose}>
            <Text style={styles.celebBtnText}>Super ! 🎉</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 16 },
  category: { gap: 8 },
  categoryLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    width: 80,
    padding: 8,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    gap: 4,
  },
  badgeUnlocked: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  badgeEmoji: { fontSize: 28 },
  badgeLocked: { opacity: 0.3 },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', lineHeight: 13 },
  textLocked: { color: Colors.textMuted },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: 32,
    width: '80%',
    alignItems: 'center',
    gap: 10,
  },
  celebEmoji: { fontSize: 64 },
  celebTitle: { fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },
  celebLabel: { fontSize: 22, fontWeight: '800', color: Colors.accent, textAlign: 'center' },
  celebDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  celebBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: Colors.radiusPill,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  celebBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
