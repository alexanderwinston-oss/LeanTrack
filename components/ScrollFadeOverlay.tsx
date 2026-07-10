import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  color: string;
  width?: number;
}

// Right-edge fade signaling more horizontally-scrollable content, built on
// react-native-svg (already linked in this app) instead of expo-linear-gradient
// (not installed — would require a native rebuild). Coordinates use percentage
// strings to match react-native-svg's own LinearGradient defaultProps exactly
// (x1: '0%', y1: '0%', x2: '100%', y2: '0%') — bare unitless "0"/"1" strings
// risk the gradient degenerating to a solid flat fill instead of a fade.
export function ScrollFadeOverlay({ color, width = 48 }: Props) {
  return (
    <Svg width={width} height="100%" style={styles.overlay} pointerEvents="none">
      <Defs>
        <LinearGradient id="scrollFadeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={color} stopOpacity={0} />
          <Stop offset="100%" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrollFadeGradient)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
  },
});
