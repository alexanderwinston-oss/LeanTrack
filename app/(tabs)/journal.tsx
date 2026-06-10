import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, router } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MealCard } from '@/components/MealCard';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import { checkAllAchievements } from '@/lib/db';
import { searchFood } from '@/lib/openfoodfacts';
import { analyzeFoodPhoto } from '@/lib/gemini';
import { getLocalDateString, showGeminiError } from '@/lib/utils';
import { useBackHandler } from '@/lib/useBackHandler';
import { FoodItem, Meal, MealType } from '@/lib/types';

const SECTIONS: { type: MealType; label: string; emoji: string }[] = [
  { type: 'petit_dejeuner', label: 'Petit-déjeuner', emoji: '🥣' },
  { type: 'dejeuner', label: 'Déjeuner', emoji: '🍽️' },
  { type: 'diner', label: 'Dîner', emoji: '🌙' },
  { type: 'collation', label: 'Collation', emoji: '🍎' },
];

const MEAL_TYPE_CHIPS: { key: MealType; label: string }[] = [
  { key: 'petit_dejeuner', label: '🥣 Petit-déj' },
  { key: 'dejeuner', label: '🍽️ Déjeuner' },
  { key: 'diner', label: '🌙 Dîner' },
  { key: 'collation', label: '🍎 Collation' },
];

type ModalTab = 'search' | 'manual' | 'ai';

export default function Journal() {
  const meals = useStore((s) => s.meals);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const addMealToStore = useStore((s) => s.addMealToStore);
  const dailyTotals = useStore((s) => s.dailyTotals);
  const setPendingImage = useStore((s) => s.setPendingImage);
  const setCurrentMealType = useStore((s) => s.setCurrentMealType);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeMealType, setActiveMealType] = useState<MealType>('dejeuner');
  const [toastMessage, setToastMessage] = useState('');
  const toastAnim = useRef(new Animated.Value(200)).current;

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [foodQuantity, setFoodQuantity] = useState('100');
  const [foodBottomSheetVisible, setFoodBottomSheetVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Modal tab + manual/AI entry state
  const [modalTab, setModalTab] = useState<ModalTab>('search');
  const [manualName, setManualName] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualProt, setManualProt] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [textDescription, setTextDescription] = useState('');
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshDailyData(getLocalDateString());
    }, [])
  );

  useBackHandler(() => {
    if (foodBottomSheetVisible) { setFoodBottomSheetVisible(false); return true; }
    if (modalVisible) { setModalVisible(false); return true; }
    return false;
  }, [foodBottomSheetVisible, modalVisible]);

  function showToast(message: string) {
    setToastMessage(message);
    toastAnim.setValue(200);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 200, duration: 250, useNativeDriver: true }),
    ]).start(() => setToastMessage(''));
  }

  async function pickFromGalleryAndAnalyse() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie pour continuer.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setPendingImage(res.assets[0].base64);
      setCurrentMealType(activeMealType);
      setModalVisible(false);
      router.push('/photo-analyse');
    }
  }

  async function takePhotoAndAnalyse() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la caméra pour continuer.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setPendingImage(res.assets[0].base64);
      setCurrentMealType(activeMealType);
      setModalVisible(false);
      router.push('/photo-analyse');
    }
  }

  function openAdd(type: MealType) {
    setActiveMealType(type);
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setQuantity('100');
    setFoodQuantity('100');
    setFoodBottomSheetVisible(false);
    setModalTab('search');
    setTextDescription('');
    setPage(1);
    setHasMore(true);
    setModalVisible(true);
  }

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setPage(1);
    setHasMore(true);
    setSelectedFood(null);
    try {
      const r = await searchFood(query, 1);
      setResults(r);
      setHasMore(r.length > 0);
    } catch {
      Alert.alert('Erreur', 'Impossible de rechercher. Vérifie ta connexion.');
    } finally {
      setSearching(false);
    }
  }

  async function loadMoreResults() {
    if (loadingMore || !hasMore || !query.trim()) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const r = await searchFood(query, nextPage);
      setResults((prev) => [...prev, ...r]);
      setPage(nextPage);
      setHasMore(r.length > 0);
    } catch {
      // silently fail for pagination
    } finally {
      setLoadingMore(false);
    }
  }

  async function addFromFood(food: FoodItem) {
    const today = getLocalDateString();
    const q = parseFloat(foodQuantity) || 100;
    const factor = q / 100;
    const calories = Math.round(food.calories_100g * factor);
    const meal: Meal = {
      date: today,
      meal_type: activeMealType,
      food_name: food.name,
      quantity_g: q,
      calories,
      protein: Math.round(food.protein_100g * factor),
      carbs: Math.round(food.carbs_100g * factor),
      fat: Math.round(food.fat_100g * factor),
      source: 'search',
    };
    try {
      await addMealToStore(meal);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFoodBottomSheetVisible(false);
      setSelectedFood(null);
      setModalVisible(false);
      showToast(`✅ ${food.name} ajouté · ${calories} kcal`);
      const newlyUnlocked = await checkAllAchievements();
      newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas. Réessaie.');
    }
  }

  async function addManual() {
    if (!manualName.trim()) return;
    const today = getLocalDateString();
    const calories = parseFloat(manualCal) || 0;
    const meal: Meal = {
      date: today,
      meal_type: activeMealType,
      food_name: manualName,
      quantity_g: parseFloat(quantity) || 100,
      calories,
      protein: parseFloat(manualProt) || 0,
      carbs: parseFloat(manualCarbs) || 0,
      fat: parseFloat(manualFat) || 0,
      source: 'manual',
    };
    try {
      await addMealToStore(meal);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      showToast(`✅ ${manualName} ajouté · ${calories} kcal`);
      const newlyUnlocked = await checkAllAchievements();
      newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas. Réessaie.');
    }
  }

  async function analyzeTextDescription() {
    if (!textDescription.trim()) return;
    setIsAnalyzingText(true);
    try {
      const result = await analyzeFoodPhoto(null, textDescription);
      setManualName(result.aliment_principal);
      setManualCal(String(Math.round(result.calories_estimees)));
      setManualProt(String(Math.round(result.proteines_g)));
      setManualCarbs(String(Math.round(result.glucides_g)));
      setManualFat(String(Math.round(result.lipides_g)));
      setModalTab('manual');
    } catch (err) {
      showGeminiError(err);
    } finally {
      setIsAnalyzingText(false);
    }
  }

  function refresh() {
    refreshDailyData(getLocalDateString());
  }

  const mealsByType = (type: MealType) => meals.filter((m) => m.meal_type === type);

  const searchHeader = (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un aliment..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={doSearch}>
          <Text style={styles.searchBtnText}>{searching ? '...' : '🔍'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Journal du {format(new Date(), 'd MMMM', { locale: fr })}</Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>{dailyTotals.calories} kcal</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {SECTIONS.map(({ type, label, emoji }) => (
          <View key={type} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{emoji} {label}</Text>
              <Text style={styles.sectionCals}>
                {Math.round(mealsByType(type).reduce((s, m) => s + m.calories, 0))} kcal
              </Text>
            </View>

            {mealsByType(type).map((meal) => (
              <MealCard key={meal.id} meal={meal} onMealChanged={refresh} />
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={() => openAdd(type)}>
              <Text style={styles.addBtnText}>+ Ajouter un aliment</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={{ height: BOTTOM_SPACER_HEIGHT }} />
      </ScrollView>

      {/* Toast notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[styles.toast, { transform: [{ translateY: toastAnim }] }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Add food modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={{ flex: 1 }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ajouter un aliment</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Photo shortcuts */}
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoModalBtn} onPress={takePhotoAndAnalyse}>
              <Text style={styles.photoModalBtnEmoji}>📸</Text>
              <Text style={styles.photoModalBtnText}>Caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoModalBtn} onPress={pickFromGalleryAndAnalyse}>
              <Text style={styles.photoModalBtnEmoji}>🖼️</Text>
              <Text style={styles.photoModalBtnText}>Galerie</Text>
            </TouchableOpacity>
          </View>

          {/* Meal type selector */}
          <View style={styles.mealTypeRow}>
            {MEAL_TYPE_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.mealTypeChip, activeMealType === chip.key && styles.mealTypeChipActive]}
                onPress={() => setActiveMealType(chip.key)}
              >
                <Text style={[styles.mealTypeChipText, activeMealType === chip.key && styles.mealTypeChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, modalTab === 'search' && styles.modeTabActive]}
              onPress={() => setModalTab('search')}
            >
              <Text style={[styles.modeTabText, modalTab === 'search' && styles.modeTabTextActive]}>🔍 Recherche</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, modalTab === 'ai' && styles.modeTabActive]}
              onPress={() => setModalTab('ai')}
            >
              <Text style={[styles.modeTabText, modalTab === 'ai' && styles.modeTabTextActive]}>🤖 IA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, modalTab === 'manual' && styles.modeTabActive]}
              onPress={() => setModalTab('manual')}
            >
              <Text style={[styles.modeTabText, modalTab === 'manual' && styles.modeTabTextActive]}>✏️ Manuel</Text>
            </TouchableOpacity>
          </View>

          {modalTab === 'search' ? (
            <FlatList
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
              data={results}
              keyExtractor={(_, i) => String(i)}
              ListHeaderComponent={searchHeader}
              renderItem={({ item: food }) => (
                <Pressable
                  style={[styles.foodItem, selectedFood === food && styles.foodItemSelected]}
                  onPress={() => { setSelectedFood(food); setFoodQuantity('100'); setFoodBottomSheetVisible(true); }}
                >
                  <Text style={styles.foodName}>{food.name}</Text>
                  {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}
                  <Text style={styles.foodMacros}>
                    {Math.round(food.calories_100g)} kcal · P:{food.protein_100g}g G:{food.carbs_100g}g L:{food.fat_100g}g / 100g
                  </Text>
                </Pressable>
              )}
              ListFooterComponent={<View style={{ height: 120 }} />}
              onEndReached={loadMoreResults}
              onEndReachedThreshold={0.5}
            />
          ) : modalTab === 'ai' ? (
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent} keyboardShouldPersistTaps="handled">
              <View style={styles.manualForm}>
                <Text style={styles.aiDescHint}>
                  Décris ton repas en texte et l'IA remplira le formulaire automatiquement.
                </Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Description du repas</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top' }]}
                    value={textDescription}
                    onChangeText={setTextDescription}
                    multiline
                    placeholder="Ex: steak haché avec riz basmati et haricots verts vapeur..."
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <Button
                  label={isAnalyzingText ? 'Analyse en cours...' : '🤖 Analyser et remplir'}
                  onPress={analyzeTextDescription}
                  loading={isAnalyzingText}
                />
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent} keyboardShouldPersistTaps="handled">
              <View style={styles.manualForm}>
                {[
                  { label: 'Nom de l\'aliment', value: manualName, set: setManualName, kb: 'default' },
                  { label: 'Calories (kcal)', value: manualCal, set: setManualCal, kb: 'numeric' },
                  { label: 'Protéines (g)', value: manualProt, set: setManualProt, kb: 'numeric' },
                  { label: 'Glucides (g)', value: manualCarbs, set: setManualCarbs, kb: 'numeric' },
                  { label: 'Lipides (g)', value: manualFat, set: setManualFat, kb: 'numeric' },
                  { label: 'Quantité (g)', value: quantity, set: setQuantity, kb: 'numeric' },
                ].map(({ label, value, set, kb }) => (
                  <View key={label} style={styles.formField}>
                    <Text style={styles.formLabel}>{label}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={value}
                      onChangeText={set as any}
                      keyboardType={kb as any}
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                ))}
                <Button label="Ajouter au journal" onPress={addManual} />
              </View>
            </ScrollView>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Food detail bottom sheet */}
      <Modal
        visible={foodBottomSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFoodBottomSheetVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setFoodBottomSheetVisible(false)}
        />
        <View style={{
          backgroundColor: '#1e293b',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 48,
        }}>
          {selectedFood && (
            <>
              <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '700', marginBottom: 2 }}>
                {selectedFood.name}
              </Text>
              {selectedFood.brand ? (
                <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                  {selectedFood.brand}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Kcal/100g', value: String(Math.round(selectedFood.calories_100g)) },
                  { label: 'P', value: `${selectedFood.protein_100g}g` },
                  { label: 'G', value: `${selectedFood.carbs_100g}g` },
                  { label: 'L', value: `${selectedFood.fat_100g}g` },
                ].map(item => (
                  <View key={item.label} style={{
                    flex: 1, backgroundColor: '#0f172a',
                    borderRadius: 8, padding: 8, alignItems: 'center',
                  }}>
                    <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '700' }}>{item.value}</Text>
                    <Text style={{ color: '#64748b', fontSize: 10 }}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Quantité (g)</Text>
              <TextInput
                value={foodQuantity}
                onChangeText={setFoodQuantity}
                keyboardType="numeric"
                style={{
                  backgroundColor: '#0f172a',
                  borderRadius: 10,
                  padding: 12,
                  color: '#f1f5f9',
                  fontSize: 18,
                  fontWeight: '700',
                  marginBottom: 8,
                }}
              />
              {(() => {
                const qty = parseFloat(foodQuantity) || 0;
                const cal = Math.round(selectedFood.calories_100g * qty / 100);
                const prot = Math.round(selectedFood.protein_100g * qty / 100 * 10) / 10;
                const carbs = Math.round(selectedFood.carbs_100g * qty / 100 * 10) / 10;
                const fat = Math.round(selectedFood.fat_100g * qty / 100 * 10) / 10;
                return (
                  <View style={{ backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#10b981', fontSize: 22, fontWeight: '800' }}>{cal} kcal</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      P:{prot}g · G:{carbs}g · L:{fat}g
                    </Text>
                  </View>
                );
              })()}
              <TouchableOpacity
                onPress={() => addFromFood(selectedFood)}
                style={{ backgroundColor: '#10b981', borderRadius: 12, padding: 16, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  Ajouter au journal
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  totalBadge: {
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radiusPill,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  totalText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  scroll: { padding: 20, gap: 20 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  sectionCals: { fontSize: 13, color: Colors.textSecondary },
  toast: {
    position: 'absolute', bottom: 90, left: 20, right: 20,
    backgroundColor: '#1e293b', borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  addBtn: {
    borderRadius: Colors.radius, borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: 'dashed', padding: 12, alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  addBtnText: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  photoRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  photoModalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.accent, padding: 12,
  },
  photoModalBtnEmoji: { fontSize: 20 },
  photoModalBtnText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: Colors.bgPrimary },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: { fontSize: 18, color: Colors.textSecondary, padding: 4 },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  mealTypeChip: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: Colors.radiusPill, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.bgSurface,
  },
  mealTypeChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  mealTypeChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  mealTypeChipTextActive: { color: Colors.accent, fontWeight: '700' },
  modeTabs: { flexDirection: 'row', padding: 16, gap: 8 },
  modeTab: {
    flex: 1, padding: 10, borderRadius: Colors.radius,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  modeTabActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  modeTabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  modeTabTextActive: { color: Colors.accent },
  modalList: { flex: 1 },
  modalListContent: { padding: 16, paddingBottom: 100 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1, backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 15, padding: 12,
  },
  searchBtn: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, padding: 12, justifyContent: 'center',
  },
  searchBtnText: { fontSize: 18 },
  foodItem: {
    padding: 12, borderRadius: Colors.radius, marginBottom: 8,
    backgroundColor: Colors.bgSurface, borderWidth: 1, borderColor: Colors.border,
  },
  foodItemSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  foodName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  foodBrand: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  foodMacros: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  qtyCard: { marginBottom: 12, gap: 12 },
  qtyLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  qtyInput: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 16, padding: 12,
  },
  manualForm: { gap: 12 },
  formField: { gap: 6 },
  formLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  formInput: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 15, padding: 12,
  },
  aiDescHint: {
    fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 4,
  },
});
