import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { ALL_ACHIEVEMENTS, AchievementCategory, AchievementDef } from '@/lib/achievements';

export { ALL_ACHIEVEMENTS };

interface AchievementStatus {
  unlocked_at: string | null;
  lost_at: string | null;
}

interface AchievementGridProps {
  unlockedIds: string[];
  statusMap?: Map<string, AchievementStatus>;
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'Nutrition', 'Hydratation', 'Poids', 'Régularité',
  'Résilience', 'Fidélité', 'Volume', 'Secret',
];

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  Nutrition: '🍽️ Nutrition',
  Hydratation: '💧 Hydratation',
  Poids: '⚖️ Poids',
  Régularité: '📅 Régularité',
  Résilience: '🔄 Résilience',
  Fidélité: '🗓️ Fidélité',
  Volume: '📊 Volume',
  Secret: '🔐 Secret',
};

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#94a3b8',
  gold: '#fbbf24',
};

function BadgeItem({
  def,
  unlocked,
  lost,
  onPress,
}: {
  def: AchievementDef;
  unlocked: boolean;
  lost: boolean;
  onPress: () => void;
}) {
  const tierColor = def.tier ? TIER_COLORS[def.tier] : null;

  if (!unlocked && def.secret) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.badge, { opacity: 0.35 }]} activeOpacity={0.75}>
        <Text style={styles.badgeEmoji}>🔒</Text>
        <Text style={[styles.badgeLabel, styles.textLocked]} numberOfLines={2}>???</Text>
      </TouchableOpacity>
    );
  }

  if (!unlocked) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.badge, { opacity: 0.6 }]} activeOpacity={0.75}>
        <Text style={styles.badgeEmoji}>🔒</Text>
        <Text style={[styles.badgeLabel, { color: '#64748b', fontSize: 9, lineHeight: 12 }]} numberOfLines={3}>
          {def.description}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.badge,
        styles.badgeUnlocked,
        lost && styles.badgeLost,
        tierColor ? { borderColor: tierColor } : null,
      ]}
      activeOpacity={0.75}
    >
      <Text style={styles.badgeEmoji}>{def.emoji}</Text>
      {lost && <Text style={styles.lostIcon}>🔒</Text>}
      <Text style={styles.badgeLabel} numberOfLines={2}>{def.label}</Text>
      {def.xp > 0 && <Text style={styles.badgeXp}>+{def.xp} XP</Text>}
    </TouchableOpacity>
  );
}

export function AchievementGrid({ unlockedIds, statusMap = new Map() }: AchievementGridProps) {
  const [selected, setSelected] = useState<AchievementDef | null>(null);

  function getStatus(id: string) {
    const status = statusMap.get(id);
    const unlocked = unlockedIds.includes(id) || !!status?.unlocked_at;
    const lost = !!status?.lost_at && !unlockedIds.includes(id);
    return { unlocked, lost, status };
  }

  return (
    <>
      <View style={styles.grid}>
        {CATEGORY_ORDER.map((cat) => {
          const badges = ALL_ACHIEVEMENTS.filter((a) => a.category === cat);
          const visible = badges.filter(
            (a) => !a.secret || unlockedIds.includes(a.id)
          );
          if (visible.length === 0) return null;
          return (
            <View key={cat} style={styles.category}>
              <Text style={styles.categoryLabel}>{CATEGORY_LABELS[cat]}</Text>
              <View style={styles.badgeRow}>
                {visible.map((def) => {
                  const { unlocked, lost } = getStatus(def.id);
                  return (
                    <BadgeItem
                      key={def.id}
                      def={def}
                      unlocked={unlocked}
                      lost={lost}
                      onPress={() => setSelected(def)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={!!selected} transparent animationType="fade">
        <TouchableOpacity
          style={styles.tapOverlay}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        >
          {selected && (() => {
            const { unlocked, status } = getStatus(selected.id);
            const tierColor = selected.tier ? TIER_COLORS[selected.tier] : Colors.accent;
            const borderColor = unlocked ? tierColor : Colors.border;

            if (!unlocked && selected.secret) {
              return (
                <View style={[styles.tapCard, { borderColor }]}>
                  <Text style={styles.tapEmoji}>🔒</Text>
                  <Text style={styles.tapLabel}>???</Text>
                  <Text style={styles.tapDesc}>Badge secret — continue tes efforts !</Text>
                  <Text style={styles.tapCategory}>{selected.category}</Text>
                  <Text style={styles.tapLocked}>🔒 Non débloqué — Continue tes efforts !</Text>
                </View>
              );
            }

            if (!unlocked) {
              return (
                <View style={[styles.tapCard, { borderColor }]}>
                  <Text style={styles.tapEmoji}>🔒</Text>
                  <Text style={styles.tapLabel}>Badge verrouillé</Text>
                  <Text style={styles.tapDesc}>{selected.description}</Text>
                  <Text style={styles.tapCategory}>{selected.category}</Text>
                  <View style={styles.objectifBox}>
                    <Text style={styles.objectifLabel}>🎯 Objectif</Text>
                    <Text style={styles.objectifText}>{selected.description}</Text>
                  </View>
                  {selected.xp > 0 && (
                    <Text style={styles.rewardText}>Récompense : ⚡ {selected.xp} XP</Text>
                  )}
                </View>
              );
            }

            return (
              <View style={[styles.tapCard, { borderColor }]}>
                <Text style={styles.tapEmoji}>{selected.emoji}</Text>
                <Text style={styles.tapLabel}>{selected.label}</Text>
                <Text style={styles.tapDesc}>{selected.description}</Text>
                <Text style={styles.tapCategory}>{selected.category}</Text>
                {selected.xp > 0 && (
                  <Text style={styles.tapXp}>⚡ +{selected.xp} XP</Text>
                )}
                {status?.unlocked_at ? (
                  <Text style={styles.tapUnlockedAt}>
                    ✅ Débloqué le {format(new Date(status.unlocked_at), 'dd MMM yyyy', { locale: fr })}
                  </Text>
                ) : (
                  <Text style={styles.tapUnlockedAt}>✅ Débloqué</Text>
                )}
              </View>
            );
          })()}
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export { AchievementGrid as AllAchievementsGrid };

interface CelebrationModalProps {
  achievementId: string | null;
  onClose: () => void;
}

export function CelebrationModal({ achievementId, onClose }: CelebrationModalProps) {
  const scale = useRef(new Animated.Value(0.3)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const def = ALL_ACHIEVEMENTS.find((d) => d.id === achievementId);

  useEffect(() => {
    if (achievementId) {
      scale.setValue(0.3);
      bgOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [achievementId]);

  if (!def) return null;

  return (
    <Modal visible={!!achievementId} transparent animationType="none">
      <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
        <Animated.View style={[styles.celebCard, { transform: [{ scale }] }]}>
          <Text style={styles.celebEmoji}>{def.emoji}</Text>
          <Text style={styles.celebTitle}>Palier débloqué !</Text>
          <Text style={styles.celebLabel}>{def.label}</Text>
          <Text style={styles.celebDesc}>{def.description}</Text>
          {def.xp > 0 && (
            <Text style={styles.celebXp}>⚡ +{def.xp} XP</Text>
          )}
          <Pressable style={styles.celebBtn} onPress={onClose}>
            <Text style={styles.celebBtnText}>Super ! 🎉</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 16 },
  category: { gap: 8 },
  categoryLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    width: 80, padding: 8, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgSurface, alignItems: 'center', gap: 4,
  },
  badgeUnlocked: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  badgeLost: { borderColor: Colors.warning, backgroundColor: 'rgba(245,158,11,0.08)', opacity: 0.7 },
  badgeEmoji: { fontSize: 28 },
  badgeLocked: { opacity: 0.3 },
  lostIcon: { position: 'absolute', top: 4, right: 4, fontSize: 10 },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', lineHeight: 13 },
  textLocked: { color: Colors.textMuted },
  badgeXp: { color: '#fbbf24', fontSize: 9, fontWeight: '700' },
  tapOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  tapCard: {
    margin: 40, backgroundColor: '#1e293b',
    borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1,
  },
  tapEmoji: { fontSize: 56 },
  tapLabel: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  tapDesc: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  tapCategory: { color: Colors.textMuted, fontSize: 12, marginTop: 6 },
  tapXp: { color: '#fbbf24', fontSize: 14, fontWeight: '700', marginTop: 8 },
  tapUnlockedAt: { color: Colors.accent, fontSize: 12, marginTop: 12 },
  tapLocked: { color: Colors.textMuted, fontSize: 12, marginTop: 12, textAlign: 'center' },
  objectifBox: {
    backgroundColor: '#0f172a', borderRadius: 10, padding: 12,
    marginTop: 12, width: '100%', borderWidth: 1, borderColor: '#334155',
  },
  objectifLabel: { color: '#10b981', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  objectifText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  rewardText: { color: '#fbbf24', fontSize: 13, fontWeight: '600', marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  celebCard: {
    backgroundColor: Colors.bgSurface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.accent,
    padding: 32, width: '80%', alignItems: 'center', gap: 10,
  },
  celebEmoji: { fontSize: 64 },
  celebTitle: { fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },
  celebLabel: { fontSize: 22, fontWeight: '800', color: Colors.accent, textAlign: 'center' },
  celebDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  celebXp: { color: '#fbbf24', fontSize: 16, fontWeight: '700' },
  celebBtn: {
    marginTop: 8, backgroundColor: Colors.accent,
    borderRadius: Colors.radiusPill, paddingVertical: 12, paddingHorizontal: 28,
  },
  celebBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
