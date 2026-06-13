import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { AchievementDef, ALL_ACHIEVEMENTS } from '@/lib/achievements';

interface Props {
  badge: AchievementDef | null;
  onClose: () => void;
}

const ENCOURAGEMENTS = [
  'Continue comme ça, tu es sur la bonne voie ! 💪',
  'Excellent ! Chaque effort compte ! 🔥',
  'Tu progresses vraiment bien ! ⚡',
  'Bravo ! La régularité paie toujours ! ⭐',
  'Impressionnant ! Tu es une machine ! 🚀',
];

export default function BadgeCelebration({ badge, onClose }: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (badge) {
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
  }, [badge]);

  if (!badge) return null;

  const idx = ALL_ACHIEVEMENTS.findIndex((a) => a.id === badge.id);
  const nextBadge = ALL_ACHIEVEMENTS.slice(idx + 1).find((a) => a.category === badge.category) ?? null;

  const encouragement = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

  return (
    <Modal
      visible={!!badge}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1}>
          <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={{ alignItems: 'center', paddingBottom: 8 }}
            >
              <Text style={styles.newLabel}>🎉 Badge débloqué !</Text>
              <Text style={styles.emoji}>{badge.emoji}</Text>
              <Text style={styles.name}>{badge.label}</Text>
              <Text style={styles.desc}>{badge.description}</Text>

              <View style={styles.encourageBox}>
                <Text style={styles.encourageText}>{encouragement}</Text>
              </View>

              {nextBadge && (
                <View style={styles.nextBox}>
                  <Text style={styles.nextTitle}>Prochain objectif</Text>
                  <View style={styles.nextRow}>
                    <Text style={styles.nextEmoji}>{nextBadge.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextName}>{nextBadge.label}</Text>
                      <Text style={styles.nextDesc}>{nextBadge.description}</Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* CTA hors du ScrollView — toujours visible */}
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Continuer 🚀</Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 0,
    alignItems: 'center',
    width: '100%',
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: '#10b98155',
  },
  newLabel: { color: '#10b981', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  emoji: { fontSize: 64, marginBottom: 8 },
  name: { color: '#f1f5f9', fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  desc: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  encourageBox: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 16, width: '100%' },
  encourageText: { color: '#10b981', fontSize: 13, textAlign: 'center', fontWeight: '600', lineHeight: 18 },
  nextBox: {
    backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 16, width: '100%',
    borderWidth: 1, borderColor: '#334155',
  },
  nextTitle: { color: '#64748b', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nextEmoji: { fontSize: 28, opacity: 0.5, width: 36, textAlign: 'center' },
  nextName: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  nextDesc: { color: '#64748b', fontSize: 11, marginTop: 2, lineHeight: 16 },
  btn: { backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
