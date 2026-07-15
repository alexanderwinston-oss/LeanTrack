import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { useTabSwipeGesture } from '@/lib/useTabSwipeGesture';

export const BOTTOM_SPACER_HEIGHT = 90;

export function ScreenContainer({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const swipeGesture = useTabSwipeGesture();
  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={[styles.container, { paddingTop: insets.top }, style]}>
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
});
