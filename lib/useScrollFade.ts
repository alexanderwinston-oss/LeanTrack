import { useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Tracks whether a horizontal ScrollView's content overflows its container and,
// if so, whether the user has scrolled to the end — for showing/hiding a
// right-edge fade indicator. Gating on "is this even scrollable" (not just
// "have we scrolled to the end") avoids showing a fade over content that never
// overflows the container in the first place.
export function useScrollFade() {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const isScrollable = contentWidth > containerWidth;
  const isAtEnd = containerWidth + scrollOffset >= contentWidth - 8;
  const showFade = isScrollable && !isAtEnd;

  function onLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  function onContentSizeChange(width: number) {
    setContentWidth(width);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setScrollOffset(e.nativeEvent.contentOffset.x);
  }

  return { showFade, onLayout, onContentSizeChange, onScroll };
}
