import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/Colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  consumed: number;
  target: number;
  size?: number;
}

export function ProgressRing({ consumed, target, size = 180 }: ProgressRingProps) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  const ratio = target > 0 ? consumed / target : 0;

  useEffect(() => {
    progress.value = withTiming(Math.min(ratio, 1), { duration: 800 });
  }, [ratio]);

  const color =
    ratio > 1 ? Colors.danger :
    ratio >= 0.9 ? Colors.warning :
    Colors.accent;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.trackBg}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.consumed, { color }]}>{Math.round(consumed)}</Text>
        <Text style={styles.target}>/ {Math.round(target)} kcal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  consumed: {
    fontSize: 32,
    fontWeight: '700',
  },
  target: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
