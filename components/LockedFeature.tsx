import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { FEATURE_UNLOCK_LEVELS, useFeatureUnlocked } from '@/lib/featureFlags';
import { XP_LEVELS } from '@/lib/utils';

interface Props {
  feature: keyof typeof FEATURE_UNLOCK_LEVELS;
  children: React.ReactNode;
  lockedLabel?: string;
}

export function LockedFeature({ feature, children, lockedLabel }: Props) {
  const unlocked = useFeatureUnlocked(feature);
  if (unlocked) return <>{children}</>;

  const requiredLevel = FEATURE_UNLOCK_LEVELS[feature];
  const levelDef = XP_LEVELS.find((l) => l.level === requiredLevel);
  const label = lockedLabel ?? `Débloqué au niveau ${requiredLevel} — ${levelDef?.label ?? ''}`;

  return (
    <View style={styles.wrapper}>
      {children}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => {}}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockLabel}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  lockIcon: { fontSize: 20 },
  lockLabel: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
