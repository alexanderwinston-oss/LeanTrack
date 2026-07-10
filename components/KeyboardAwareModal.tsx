import React, { useRef } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, ScrollView,
  StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // Optional sticky footer, rendered OUTSIDE the scrollable content so a primary
  // action button (e.g. a save/confirm CTA) is never pushed out of view by content
  // growing above it. Omit for modals that don't need a pinned bottom action.
  footer?: React.ReactNode;
}

export default function KeyboardAwareModal({ visible, onClose, children, footer }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { Keyboard.dismiss(); onClose(); }}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => { Keyboard.dismiss(); onClose(); }}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoidingView}>
        <View style={styles.sheet}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            <TouchableOpacity activeOpacity={1}>
              {children}
            </TouchableOpacity>
          </ScrollView>
          {footer && (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  avoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: '#1e293b',
  },
});
