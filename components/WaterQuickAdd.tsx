import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { useStore } from '@/lib/store';
import {
  addWaterFavorite, checkAllAchievements, deleteWaterFavorite, getWaterFavorites,
} from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { registerModal } from '@/lib/useModalManager';

interface Props {
  quickAmounts: number[];
  onAdded?: () => void;
}

export function WaterQuickAdd({ quickAmounts, onAdded }: Props) {
  const addWaterToStore = useStore((s) => s.addWaterToStore);
  const [favorites, setFavorites] = useState<{ id: number; amount_ml: number; label: string | null }[]>([]);
  const [addingWater, setAddingWater] = useState(false);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [savingFavorite, setSavingFavorite] = useState(false);

  registerModal('waterCustom', customModalVisible, () => {
    setCustomModalVisible(false);
    setCustomInput('');
  }, 10);

  useFocusEffect(
    React.useCallback(() => {
      getWaterFavorites().then(setFavorites).catch(() => {});
    }, [])
  );

  async function addWater(ml: number) {
    setAddingWater(true);
    try {
      await addWaterToStore(getLocalDateString(), ml);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newlyUnlocked = await checkAllAchievements();
      newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
      onAdded?.();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'eau. Réessaie.');
    } finally {
      setAddingWater(false);
    }
  }

  function handleDeleteFavorite(id: number) {
    Alert.alert('Supprimer ce favori ?', '', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteWaterFavorite(id);
          setFavorites(await getWaterFavorites());
        },
      },
    ]);
  }

  async function handleSaveFavorite() {
    const ml = parseInt(customInput, 10);
    if (!ml || ml < 50 || ml > 2000) return;
    setSavingFavorite(true);
    try {
      await addWaterFavorite(ml);
      setFavorites(await getWaterFavorites());
      Alert.alert('⭐ Ajouté aux favoris !', `${ml} ml sauvegardé`);
    } catch (err: any) {
      if (err?.message === 'MAX_FAVORITES') {
        Alert.alert('Limite atteinte', 'Tu as atteint le maximum de 8 favoris.');
      }
    } finally {
      setSavingFavorite(false);
    }
  }

  async function handleConfirmCustom() {
    const ml = parseInt(customInput, 10);
    if (!ml || ml < 50 || ml > 2000) {
      Alert.alert('Volume invalide', 'Entre un volume entre 50 et 2000 ml');
      return;
    }
    await addWater(ml);
    setCustomModalVisible(false);
    setCustomInput('');
  }

  return (
    <>
      <View style={styles.quickGrid}>
        {quickAmounts.map((ml) => (
          <TouchableOpacity
            key={ml}
            style={[styles.quickBtn, addingWater && { opacity: 0.5 }]}
            onPress={() => addWater(ml)}
            disabled={addingWater}
          >
            <Text style={styles.quickBtnIcon}>💧</Text>
            <Text style={styles.quickBtnText}>+{ml}ml</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.quickBtn, styles.quickBtnCustom]}
          onPress={() => setCustomModalVisible(true)}
        >
          <Text style={styles.quickBtnIcon}>✏️</Text>
          <Text style={styles.quickBtnText}>Personnaliser</Text>
        </TouchableOpacity>
      </View>

      {favorites.length > 0 && (
        <>
          <Text style={styles.favoritesTitle}>⭐ Mes contenants</Text>
          <View style={styles.quickGrid}>
            {favorites.map((fav) => (
              <TouchableOpacity
                key={fav.id}
                style={[styles.quickBtn, styles.quickBtnFav, addingWater && { opacity: 0.5 }]}
                onPress={() => addWater(fav.amount_ml)}
                onLongPress={() => handleDeleteFavorite(fav.id)}
                disabled={addingWater}
              >
                <Text style={styles.quickBtnIcon}>⭐</Text>
                <Text style={styles.quickBtnText}>{fav.label ?? `${fav.amount_ml}ml`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.favoritesHint}>Appui long sur un favori pour le supprimer</Text>
        </>
      )}

      <KeyboardAwareModal
        visible={customModalVisible}
        onClose={() => { setCustomModalVisible(false); setCustomInput(''); }}
      >
        <Text style={styles.customTitle}>💧 Volume personnalisé</Text>
        <Text style={styles.customSubtitle}>Entre le volume en millilitres</Text>

        <TextInput
          style={styles.customInput}
          value={customInput}
          onChangeText={setCustomInput}
          keyboardType="number-pad"
          placeholder="Ex: 400"
          placeholderTextColor="#475569"
          autoFocus
          maxLength={4}
        />

        <TouchableOpacity
          style={styles.saveAsFavBtn}
          disabled={savingFavorite}
          onPress={handleSaveFavorite}
        >
          <Text style={styles.saveAsFavText}>
            {savingFavorite ? '...' : '⭐ Sauvegarder comme favori'}
          </Text>
        </TouchableOpacity>

        <View style={styles.customButtons}>
          <TouchableOpacity
            style={styles.customCancelBtn}
            onPress={() => { setCustomModalVisible(false); setCustomInput(''); }}
          >
            <Text style={styles.customCancelText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.customConfirmBtn,
              (!customInput || parseInt(customInput, 10) < 50) && { opacity: 0.4 },
            ]}
            disabled={!customInput || parseInt(customInput, 10) < 50}
            onPress={handleConfirmCustom}
          >
            <Text style={styles.customConfirmText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareModal>
    </>
  );
}

const styles = StyleSheet.create({
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: {
    flex: 1, minWidth: '28%',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.waterColor,
    padding: 12, alignItems: 'center', gap: 4,
  },
  quickBtnIcon: { fontSize: 20 },
  quickBtnText: { color: Colors.waterColor, fontWeight: '700', fontSize: 13 },
  quickBtnCustom: {
    borderColor: '#64748b',
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderStyle: 'dashed',
  },
  quickBtnFav: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  favoritesTitle: {
    color: Colors.textPrimary, fontWeight: '600', fontSize: 13,
    marginTop: 8, marginBottom: 6,
  },
  favoritesHint: {
    color: Colors.textMuted, fontSize: 10, textAlign: 'center',
    marginTop: 4,
  },
  customTitle: {
    color: Colors.textPrimary, fontWeight: '700', fontSize: 18,
    marginBottom: 4,
  },
  customSubtitle: {
    color: Colors.textSecondary, fontSize: 13, marginBottom: 16,
  },
  customInput: {
    backgroundColor: '#0f172a', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    color: '#f1f5f9', fontSize: 32, fontWeight: '700',
    textAlign: 'center', padding: 16, marginBottom: 12,
  },
  saveAsFavBtn: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 10, padding: 12,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#fbbf24',
  },
  saveAsFavText: { color: '#fbbf24', fontWeight: '600', fontSize: 13 },
  customButtons: { flexDirection: 'row', gap: 12 },
  customCancelBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: '#1e293b', alignItems: 'center',
  },
  customCancelText: { color: '#94a3b8', fontWeight: '600' },
  customConfirmBtn: {
    flex: 2, padding: 14, borderRadius: 12,
    backgroundColor: '#38bdf8', alignItems: 'center',
  },
  customConfirmText: { color: '#fff', fontWeight: '700' },
});
