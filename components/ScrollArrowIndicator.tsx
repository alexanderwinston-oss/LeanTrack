import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';

// Hints that a horizontal ScrollView has more content to swipe to. Lives in
// its own dedicated flex slot next to the ScrollView (see WaterQuickAdd /
// index.tsx callers) rather than as an absolute overlay drawn on top of the
// scroll content — that's what previously made it visually cover whatever
// chip/card happened to be at the scroll edge. The parent only mounts this
// while useScrollFade().showFade is true, so the pulse just runs for the
// component's whole lifetime instead of tracking its own visibility state.
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
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.arrowInner, { opacity }]}>
        <Text style={styles.arrow}>›</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowInner: {
    backgroundColor: 'rgba(34, 106, 76, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  arrow: {
    color: Colors.accent,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
});
