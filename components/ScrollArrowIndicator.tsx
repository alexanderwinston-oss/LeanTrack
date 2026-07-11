import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

// Right-edge indicator signaling more horizontally-scrollable content. Plain
// Animated.Text/View (no SVG) — the parent only mounts this while its
// useScrollFade().showFade is true, so the pulse just runs for the component's
// whole lifetime instead of tracking its own visibility state.
export function ScrollArrowIndicator() {
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
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <Text style={styles.arrow}>›</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 6,
    top: '50%',
    marginTop: -14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
});
