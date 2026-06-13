import React, { useRef } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, ScrollView,
  StyleSheet, TouchableOpacity, View,
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function KeyboardAwareModal({ visible, onClose, children }: Props) {
  const scrollRef = useRef<ScrollView>(null);

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
});
