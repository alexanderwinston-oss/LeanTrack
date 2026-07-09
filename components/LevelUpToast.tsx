import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/Colors';
import { XPLevel } from '@/lib/utils';

interface Props {
  level: XPLevel | null;
  onClose: () => void;
}

const FEATURE_UNLOCK_MESSAGES: Record<number, string> = {
  2: 'Favoris eau + volume custom disponibles',
  3: 'Modifier un repas jusqu’à J-1 disponible',
  4: 'Mode coach IA maintenant disponible',
  5: 'Modifier repas + eau sur J-1 complet disponible',
  6: 'Export CSV + objectifs personnalisables disponibles',
  7: 'Écran célébration objectif atteint disponible',
};

const AUTO_DISMISS_MS = 4000;

export default function LevelUpToast({ level, onClose }: Props) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (level) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      timerRef.current = setTimeout(onClose, AUTO_DISMISS_MS);
    } else {
      translateY.setValue(-100);
      opacity.setValue(0);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [level]);

  if (!level) return null;

  const featureMessage = FEATURE_UNLOCK_MESSAGES[level.level];

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.toast} activeOpacity={0.9} onPress={onClose}>
        <Text style={styles.title}>🎉 Niveau {level.level} — {level.label} débloqué !</Text>
        {!!featureMessage && <Text style={styles.subtitle}>{featureMessage}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  toast: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
});
