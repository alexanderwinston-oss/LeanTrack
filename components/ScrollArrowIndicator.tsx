import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  color: string;
  width?: number;
}

// Right-edge indicator signaling more horizontally-scrollable content. Pairs
// a static SVG fade-to-background gradient (react-native-svg, already linked
// — no native rebuild) with a pulsing arrow badge on top. useScrollFade's
// showFade is true exactly when a real chip/card sits at the edge (not
// trailing padding), so without the fade the badge always sat directly on
// top of live content — only the fade, not spacing, fixes the overlap. The
// parent only mounts this while showFade is true, so the pulse just runs for
// the component's whole lifetime instead of tracking its own visibility state.
export function ScrollArrowIndicator({ color, width = 48 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View style={[styles.wrap, { width }]} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="scrollFadeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={color} stopOpacity={0} />
            <Stop offset="100%" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrollFadeGradient)" />
      </Svg>
      <Animated.View style={[styles.arrowInner, { opacity }]}>
        <Text style={styles.arrow}>›</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  arrowInner: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 2,
  },
  arrow: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
});
