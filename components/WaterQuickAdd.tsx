import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { useStore } from '@/lib/store';
import {
  addWaterFavorite, deleteWaterFavorite, getWaterFavorites,
} from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import { checkAchievementsAndNotify } from '@/lib/featureFlags';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { registerModal } from '@/lib/useModalManager';
import { LockedFeature } from '@/components/LockedFeature';
import { ScrollArrowIndicator } from '@/components/ScrollArrowIndicator';
import { useScrollFade } from '@/lib/useScrollFade';

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
  const [openedFromFavoriteCTA, setOpenedFromFavoriteCTA] = useState(false);
  const presetFade = useScrollFade();

  registerModal('waterCustom', customModalVisible, () => {
    setCustomModalVisible(false);
    setCustomInput('');
    setOpenedFromFavoriteCTA(false);
  }, 10);

  useFocusEffect(
    React.useCallback(() => {
      getWaterFavorites().then((favs) => {
        console.log('[WaterQuickAdd] favorites loaded:', favs.length, favs);
        setFavorites(favs);
      }).catch((err) => console.error('[WaterQuickAdd] getWaterFavorites', err));
    }, [])
  );

  async function addWater(ml: number) {
    setAddingWater(true);
    try {
      await addWaterToStore(getLocalDateString(), ml);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await checkAchievementsAndNotify();
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
      setOpenedFromFavoriteCTA(false);
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

  function renderFavoriteChip(fav: { id: number; amount_ml: number; label: string | null }) {
    return (
      <TouchableOpacity
        key={`fav-${fav.id}`}
        style={[styles.chip, styles.chipFav, addingWater && styles.chipDisabled]}
        onPress={() => addWater(fav.amount_ml)}
        onLongPress={() => handleDeleteFavorite(fav.id)}
        disabled={addingWater}
      >
        <Text style={styles.chipIcon}>⭐</Text>
        <Text style={[styles.chipText, styles.chipTextFav]}>{fav.label ?? `${fav.amount_ml}ml`}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View style={styles.scrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          contentOffset={{ x: 0, y: 0 }}
          onLayout={presetFade.onLayout}
          onContentSizeChange={presetFade.onContentSizeChange}
          onScroll={presetFade.onScroll}
          scrollEventThrottle={16}
        >
          {quickAmounts.map((ml) => (
            <TouchableOpacity
              key={`preset-${ml}`}
              style={[styles.chip, styles.chipPreset, addingWater && styles.chipDisabled]}
              onPress={() => addWater(ml)}
              disabled={addingWater}
            >
              <Text style={styles.chipIcon}>💧</Text>
              <Text style={[styles.chipText, styles.chipTextPreset]}>+{ml}ml</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.chip, styles.chipAdd, addingWater && styles.chipDisabled]}
            onPress={() => setCustomModalVisible(true)}
            disabled={addingWater}
          >
            <Text style={styles.chipAddIcon}>+</Text>
          </TouchableOpacity>
        </ScrollView>
        {presetFade.showFade && <ScrollArrowIndicator color={Colors.bgSurface} />}
      </View>

      {favorites.length === 0 && (
        <TouchableOpacity
          onPress={() => {
            setOpenedFromFavoriteCTA(true);
            setCustomModalVisible(true);
          }}
          style={styles.favoriteCTA}
        >
          <Text style={styles.favoriteCTAIcon}>☆</Text>
          <Text style={styles.favoriteCTAText}>Ajouter un volume favori</Text>
        </TouchableOpacity>
      )}

      {favorites.length === 1 && (
        <View style={styles.pinnedFavRow}>
          {renderFavoriteChip(favorites[0])}
        </View>
      )}

      {favorites.length > 1 && (
        <View style={[styles.scrollWrap, styles.pinnedFavRow]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            contentOffset={{ x: 0, y: 0 }}
          >
            {favorites.map((fav) => renderFavoriteChip(fav))}
          </ScrollView>
        </View>
      )}

      <KeyboardAwareModal
        visible={customModalVisible}
        onClose={() => { setCustomModalVisible(false); setCustomInput(''); setOpenedFromFavoriteCTA(false); }}
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

        <LockedFeature feature="WATER_FAVORITES">
          <TouchableOpacity
            style={[styles.saveAsFavBtn, openedFromFavoriteCTA && styles.saveAsFavBtnHighlighted]}
            disabled={savingFavorite}
            onPress={handleSaveFavorite}
          >
            <Text style={[styles.saveAsFavText, openedFromFavoriteCTA && styles.saveAsFavTextHighlighted]}>
              {savingFavorite ? '...' : '⭐ Sauvegarder comme favori'}
            </Text>
          </TouchableOpacity>
        </LockedFeature>

        <View style={styles.customButtons}>
          <TouchableOpacity
            style={styles.customCancelBtn}
            onPress={() => { setCustomModalVisible(false); setCustomInput(''); setOpenedFromFavoriteCTA(false); }}
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
  scrollWrap: { position: 'relative', overflow: 'hidden' },
  pinnedFavRow: { marginTop: 10 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 2, paddingRight: 56 },
  chip: {
    height: 56, minWidth: 80,
    borderRadius: 28,
    paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1,
  },
  chipDisabled: { opacity: 0.5 },
  chipPreset: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: Colors.waterColor,
  },
  chipFav: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderColor: '#fbbf24',
  },
  chipAdd: {
    minWidth: 56, paddingHorizontal: 0,
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderColor: '#64748b',
    borderStyle: 'dashed',
  },
  chipIcon: { fontSize: 16 },
  chipText: { fontWeight: '700', fontSize: 13 },
  chipTextPreset: { color: Colors.waterColor },
  chipTextFav: { color: '#fbbf24' },
  chipAddIcon: { fontSize: 24, fontWeight: '700', color: '#94a3b8', lineHeight: 26 },
  favoriteCTA: {
    borderWidth: 1.5,
    borderColor: 'rgba(234, 179, 8, 0.6)',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  favoriteCTAIcon: { fontSize: 16 },
  favoriteCTAText: { color: 'rgba(234, 179, 8, 0.9)', fontSize: 14, fontWeight: '500' },
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
  saveAsFavBtnHighlighted: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: 'rgba(234, 179, 8, 0.8)',
    borderWidth: 1.5,
  },
  saveAsFavTextHighlighted: { color: 'rgba(234, 179, 8, 1)' },
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
