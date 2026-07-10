import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { snoozePhotoPopup } from '@/lib/media';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PhotoSourceModal({ visible, onCancel, onConfirm }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  async function handleConfirm() {
    if (dontShowAgain) await snoozePhotoPopup();
    setDontShowAgain(false);
    onConfirm();
  }

  function handleCancel() {
    setDontShowAgain(false);
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <Text style={styles.title}>📸 Analyser ton repas</Text>
          <Text style={styles.text}>
            Prends ou importe une photo de ce que tu as mangé. LeanTrack identifie les aliments
            et estime les valeurs nutritionnelles automatiquement.
          </Text>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setDontShowAgain((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, dontShowAgain && styles.checkboxChecked]}>
              {dontShowAgain && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Ne plus afficher pendant 7 jours</Text>
          </TouchableOpacity>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>C'est parti !</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  text: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: Colors.radius,
    backgroundColor: Colors.bgElevated, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: {
    flex: 2, padding: 14, borderRadius: Colors.radius,
    backgroundColor: Colors.accent, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
