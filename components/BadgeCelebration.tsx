import React, { useEffect, useRef } from 'react';
import {
  Animated, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { AchievementDef, ALL_ACHIEVEMENTS } from '@/lib/achievements';
import { Colors } from '@/constants/Colors';

const SCREEN_HEIGHT = Dimensions.get('window').height;

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
  const prevBadgeRef = useRef<AchievementDef | null>(null);

  useEffect(() => {
    if (badge && prevBadgeRef.current === null) {
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
    prevBadgeRef.current = badge;
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
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={{ width: '100%' }}>
          <Animated.View
            style={[styles.card, { transform: [{ scale: scaleAnim }] }]}
          >
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.headerLabel}>🎉 Badge débloqué !</Text>
              <Text style={styles.emoji}>{badge?.emoji}</Text>
              <Text style={styles.name}>{badge?.label}</Text>
              <Text style={styles.desc}>{badge?.description}</Text>

              {!!encouragement && (
                <View style={styles.encourageBox}>
                  <Text style={styles.encourageText}>{encouragement}</Text>
                </View>
              )}

              {!!nextBadge && (
                <View style={styles.nextBox}>
                  <Text style={styles.nextTitle}>PROCHAIN OBJECTIF</Text>
                  <View style={styles.nextRow}>
                    <Text style={styles.nextEmoji}>{nextBadge.emoji}</Text>
                    <View style={styles.nextTextCol}>
                      <Text style={styles.nextName}>{nextBadge.label}</Text>
                      <Text style={styles.nextDesc}>
                        {nextBadge.description}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Continuer 🚀</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 24,
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderWidth: 1,
    borderColor: '#226A4C55',
    overflow: 'hidden',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  scroll: {
    flexShrink: 1,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  headerLabel: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
    textAlign: 'center',
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    width: '100%',
  },
  encourageBox: {
    backgroundColor: Colors.accentSubtle,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    width: '100%',
  },
  encourageText: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  nextBox: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 4,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nextTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  nextEmoji: {
    fontSize: 32,
    width: 40,
    textAlign: 'center',
  },
  nextTextCol: {
    flex: 1,
  },
  nextName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  nextDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  btnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
