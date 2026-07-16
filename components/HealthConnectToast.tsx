import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARTICLE_COUNT = 10;
const TOTAL_MS = 3000;
const ENTER_MS = 220;
const BURST_MS = 700;
const EXIT_MS = 380;
const HOLD_MS = TOTAL_MS - EXIT_MS;
const OFFSCREEN_START = SCREEN_HEIGHT * 0.5 + 140;
const EXIT_OFFSET = 80;
const SPRING = { damping: 15, stiffness: 140, mass: 0.9 };

const PALETTE = [
  Colors.accent,
  Colors.accentContainer,
  Colors.proteinColor,
  Colors.carbsColor,
  Colors.fatColor,
  Colors.waterColorLight,
];

interface ParticleConfig {
  angle: number;
  distance: number;
  color: string;
  size: number;
}

function Particle({ config, burst }: { config: ParticleConfig; burst: SharedValue<number> }) {
  const { angle, distance, color, size } = config;

  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: 1 - p,
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: Math.sin(angle) * distance * p },
        { scale: 1 - 0.4 * p },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

interface HealthConnectToastProps {
  visible: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}

export default function HealthConnectToast({ visible, icon, title, subtitle, onClose }: HealthConnectToastProps) {
  const translateY = useSharedValue(OFFSCREEN_START);
  const opacity = useSharedValue(0);
  const burst = useSharedValue(0);
  const progress = useSharedValue(1);

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const particles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        angle: (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        distance: 70 + Math.random() * 50,
        color: PALETTE[i % PALETTE.length],
        size: 6 + Math.round(Math.random() * 5),
      })),
    []
  );

  const dismiss = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    const cb = onCloseRef.current;
    cancelAnimation(progress);
    opacity.value = withTiming(0, { duration: EXIT_MS });
    translateY.value = withTiming(EXIT_OFFSET, { duration: EXIT_MS }, (finished) => {
      'worklet';
      if (finished) runOnJS(cb)();
    });
  }, []);

  useEffect(() => {
    if (visible) {
      exitingRef.current = false;
      translateY.value = OFFSCREEN_START;
      opacity.value = 0;
      burst.value = 0;
      progress.value = 1;

      translateY.value = withSpring(0, SPRING);
      opacity.value = withTiming(1, { duration: ENTER_MS });
      burst.value = withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.cubic) });
      progress.value = withTiming(0, { duration: TOTAL_MS, easing: Easing.linear });

      exitTimerRef.current = setTimeout(dismiss, HOLD_MS);
    }

    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      cancelAnimation(translateY);
      cancelAnimation(opacity);
      cancelAnimation(burst);
      cancelAnimation(progress);
    };
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value * 0.3 }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />

      <View style={styles.particleLayer} pointerEvents="none">
        {particles.map((p, i) => (
          <Particle key={i} config={p} burst={burst} />
        ))}
      </View>

      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable onPress={dismiss} style={styles.cardInner}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, barStyle]} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
  },
  particleLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: SCREEN_WIDTH - 48,
    maxWidth: 420,
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#226A4C55',
    overflow: 'hidden',
  },
  cardInner: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  icon: { fontSize: 48, marginBottom: 12, textAlign: 'center' },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  progressTrack: {
    height: 4,
    width: '100%',
    backgroundColor: Colors.trackBg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
});
