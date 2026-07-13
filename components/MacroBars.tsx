import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
  unit?: string;
}

function MacroBar({ label, consumed, target, color, unit = 'g' }: MacroBarProps) {
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(ratio, { duration: 700 });
  }, [ratio]);

  const animStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          <Text style={{ color }}>{Math.round(consumed)}</Text>
          <Text style={styles.macroTarget}> / {Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, animStyle]} />
      </View>
    </View>
  );
}

interface MacroBarsProps {
  protein: { consumed: number; target: number };
  carbs: { consumed: number; target: number };
  fat: { consumed: number; target: number };
}

export function MacroBars({ protein, carbs, fat }: MacroBarsProps) {
  return (
    <View style={styles.container}>
      <MacroBar label="Protéines" consumed={protein.consumed} target={protein.target} color={Colors.proteinColor} />
      <MacroBar label="Glucides" consumed={carbs.consumed} target={carbs.target} color={Colors.carbsColor} />
      <MacroBar label="Lipides" consumed={fat.consumed} target={fat.target} color={Colors.fatColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  macroRow: { gap: 6 },
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  macroValue: { fontSize: 13, fontWeight: '600' },
  macroTarget: { color: Colors.textSecondary, fontWeight: '400' },
  track: {
    height: 8,
    backgroundColor: Colors.trackBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
