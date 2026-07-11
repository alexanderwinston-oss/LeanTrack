import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MealCard } from '@/components/MealCard';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import { checkAchievementsAndNotify, useFeatureUnlocked } from '@/lib/featureFlags';
import { searchFood } from '@/lib/openfoodfacts';
import { analyzeFoodPhoto } from '@/lib/gemini';
import { saveToLeanTrackAlbum } from '@/lib/media';
import { getLocalDateString } from '@/lib/utils';
import { registerModal } from '@/lib/useModalManager';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import { LockedFeature } from '@/components/LockedFeature';
import {
  addMeal, addWater, deleteWaterEntry, getMealsForDate, getWaterForDate, getWaterLogsForDate,
} from '@/lib/db';
import { FoodItem, Meal, MealType } from '@/lib/types';

const SECTIONS: { type: MealType; label: string; emoji: string }[] = [
  { type: 'petit_dejeuner', label: 'Petit-déjeuner', emoji: '🥣' },
  { type: 'dejeuner', label: 'Déjeuner', emoji: '🍽️' },
  { type: 'diner', label: 'Dîner', emoji: '🌙' },
  { type: 'collation', label: 'Collation', emoji: '🍎' },
];

type ModalTab = 'description' | 'search';

function getYesterdayString(): string {
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  return getLocalDateString(yesterdayDate);
}

export default function Journal() {
  const insets = useSafeAreaInsets();
  const meals = useStore((s) => s.meals);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const addMealToStore = useStore((s) => s.addMealToStore);
  const dailyTotals = useStore((s) => s.dailyTotals);
  const setPendingImage = useStore((s) => s.setPendingImage);
  const setCurrentMealType = useStore((s) => s.setCurrentMealType);
  const setPendingMealDate = useStore((s) => s.setPendingMealDate);

  const today = getLocalDateString();
  const yesterday = getYesterdayString();
  const canEditYesterday = useFeatureUnlocked('EDIT_YESTERDAY');

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [yesterdayMeals, setYesterdayMeals] = useState<Meal[]>([]);
  const [yesterdayWaterTotal, setYesterdayWaterTotal] = useState(0);
  const [yesterdayWaterLogs, setYesterdayWaterLogs] = useState<
    { id: number; amount_ml: number; created_at: string }[]
  >([]);
  const isYesterday = selectedDate === yesterday;

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

  // Modal tab + description/manual entry state
  const [modalTab, setModalTab] = useState<ModalTab>('description');
  const [manualName, setManualName] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualProt, setManualProt] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [textDescription, setTextDescription] = useState('');
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  const [descFormVisible, setDescFormVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const descScrollRef = useRef<ScrollView>(null);

  const loadYesterdayData = useCallback(async () => {
    const [ms, waterTotal, waterLogs] = await Promise.all([
      getMealsForDate(yesterday),
      getWaterForDate(yesterday),
      getWaterLogsForDate(yesterday),
    ]);
    setYesterdayMeals(ms);
    setYesterdayWaterTotal(waterTotal);
    setYesterdayWaterLogs(waterLogs);
  }, [yesterday]);

  useFocusEffect(
    useCallback(() => {
      refreshDailyData(getLocalDateString());
      if (isYesterday) loadYesterdayData();
    }, [isYesterday])
  );

  useEffect(() => {
    if (isYesterday) loadYesterdayData();
  }, [isYesterday]);

  registerModal('journalFoodSheet', foodBottomSheetVisible, () => setFoodBottomSheetVisible(false), 10);
  registerModal('journalAddFood', modalVisible, () => setModalVisible(false), 5);

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
      setPendingMealDate(selectedDate);
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
      saveToLeanTrackAlbum(res.assets[0].uri);
      setPendingImage(res.assets[0].base64);
      setCurrentMealType(activeMealType);
      setPendingMealDate(selectedDate);
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
    setModalTab('description');
    setTextDescription('');
    setDescFormVisible(false);
    setSummaryVisible(false);
    setAiUnavailable(false);
    setManualName('');
    setManualCal('');
    setManualProt('');
    setManualCarbs('');
    setManualFat('');
    setPage(1);
    setHasMore(true);
    setModalVisible(true);
  }

  function fillManually() {
    setAiUnavailable(false);
    setSummaryVisible(false);
    setDescFormVisible(true);
  }

  function openEditFromSummary() {
    setSummaryVisible(false);
    setDescFormVisible(true);
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
    const q = parseFloat(foodQuantity) || 100;
    const factor = q / 100;
    const calories = Math.round(food.calories_100g * factor);
    const meal: Meal = {
      date: selectedDate,
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
      if (isYesterday) {
        await addMeal(meal);
        await loadYesterdayData();
      } else {
        await addMealToStore(meal);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFoodBottomSheetVisible(false);
      setSelectedFood(null);
      setModalVisible(false);
      showToast(`✅ ${food.name} ajouté · ${calories} kcal`);
      await checkAchievementsAndNotify();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas. Réessaie.');
    }
  }

  async function addManual() {
    if (!manualName.trim()) return;
    const calories = parseFloat(manualCal) || 0;
    const meal: Meal = {
      date: selectedDate,
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
      if (isYesterday) {
        await addMeal(meal);
        await loadYesterdayData();
      } else {
        await addMealToStore(meal);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      showToast(`✅ ${manualName} ajouté · ${calories} kcal`);
      await checkAchievementsAndNotify();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas. Réessaie.');
    }
  }

  async function analyzeTextDescription() {
    if (!textDescription.trim()) return;
    setIsAnalyzingText(true);
    setAiUnavailable(false);
    try {
      const result = await analyzeFoodPhoto(null, textDescription);
      setManualName(result.aliment_principal);
      setManualCal(String(Math.round(result.calories_estimees)));
      setManualProt(String(Math.round(result.proteines_g)));
      setManualCarbs(String(Math.round(result.glucides_g)));
      setManualFat(String(Math.round(result.lipides_g)));
      setQuantity(String(Math.round(result.quantite_estimee_g)));
      setSummaryVisible(true);
    } catch (err) {
      // AI failed or quota exceeded — fall back to the same editable form, empty,
      // so manual entry always remains possible.
      setManualName('');
      setManualCal('');
      setManualProt('');
      setManualCarbs('');
      setManualFat('');
      setAiUnavailable(true);
      setSummaryVisible(false);
      setDescFormVisible(true);
    } finally {
      setIsAnalyzingText(false);
    }
  }

  function refresh() {
    refreshDailyData(getLocalDateString());
  }

  function onYesterdayMealChanged() {
    loadYesterdayData();
    checkAchievementsAndNotify().catch(() => {});
  }

  async function addYesterdayWater(ml: number) {
    await addWater(yesterday, ml);
    await loadYesterdayData();
    await checkAchievementsAndNotify();
  }

  async function deleteYesterdayWater(id: number) {
    await deleteWaterEntry(id);
    await loadYesterdayData();
    await checkAchievementsAndNotify();
  }

  const displayedMeals = isYesterday ? yesterdayMeals : meals;
  const displayedTotal = isYesterday
    ? Math.round(yesterdayMeals.reduce((s, m) => s + m.calories, 0))
    : dailyTotals.calories;
  const mealsByType = (type: MealType) => displayedMeals.filter((m) => m.meal_type === type);
  const targetMealLabel = SECTIONS.find((s) => s.type === activeMealType)?.label ?? activeMealType;
  const targetMealEmoji = SECTIONS.find((s) => s.type === activeMealType)?.emoji ?? '🍽️';

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
        <Text style={styles.title}>
          Journal du {format(
            isYesterday ? new Date(yesterday + 'T12:00:00') : new Date(),
            'd MMMM', { locale: fr }
          )}
        </Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>{displayedTotal} kcal</Text>
        </View>
      </View>

      <View style={styles.datePillsRow}>
        <TouchableOpacity
          style={[styles.datePill, !isYesterday && styles.datePillActive]}
          onPress={() => setSelectedDate(today)}
        >
          <Text style={[styles.datePillText, !isYesterday && styles.datePillTextActive]}>Aujourd'hui</Text>
        </TouchableOpacity>
        <LockedFeature feature="EDIT_YESTERDAY" lockedLabel="Débloqué au niveau 3 — Régulier">
          <TouchableOpacity
            style={[styles.datePill, isYesterday && styles.datePillActive]}
            onPress={() => setSelectedDate(yesterday)}
          >
            <Text style={[styles.datePillText, isYesterday && styles.datePillTextActive]}>Hier</Text>
          </TouchableOpacity>
        </LockedFeature>
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
              <MealCard
                key={meal.id}
                meal={meal}
                onMealChanged={isYesterday ? onYesterdayMealChanged : refresh}
              />
            ))}

            {(!isYesterday || canEditYesterday) && (
              <TouchableOpacity style={styles.addBtn} onPress={() => openAdd(type)}>
                <Text style={styles.addBtnText}>+ Ajouter un aliment</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {isYesterday && canEditYesterday && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>💧 Eau</Text>
              <Text style={styles.sectionCals}>{yesterdayWaterTotal} ml</Text>
            </View>
            <View style={styles.j1WaterChipsRow}>
              {[150, 250, 500].map((ml) => (
                <TouchableOpacity key={ml} style={styles.j1WaterChip} onPress={() => addYesterdayWater(ml)}>
                  <Text style={styles.j1WaterChipText}>+{ml}ml</Text>
                </TouchableOpacity>
              ))}
            </View>
            {yesterdayWaterLogs.map((log) => (
              <View key={log.id} style={styles.j1WaterLogRow}>
                <Text style={styles.j1WaterLogText}>{log.amount_ml} ml</Text>
                <TouchableOpacity onPress={() => deleteYesterdayWater(log.id)}>
                  <Text style={styles.j1WaterLogDelete}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

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
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={{ flex: 1 }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Ajout au {targetMealLabel} — {isYesterday ? 'hier' : "aujourd'hui"}
            </Text>
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

          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, modalTab === 'description' && styles.modeTabActive]}
              onPress={() => setModalTab('description')}
            >
              <Text style={[styles.modeTabText, modalTab === 'description' && styles.modeTabTextActive]}>📝 Description</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, modalTab === 'search' && styles.modeTabActive]}
              onPress={() => setModalTab('search')}
            >
              <Text style={[styles.modeTabText, modalTab === 'search' && styles.modeTabTextActive]}>🔍 Recherche</Text>
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
          ) : (
            <>
              <ScrollView
                ref={descScrollRef}
                style={styles.descScroll}
                contentContainerStyle={styles.descScrollContent}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => descScrollRef.current?.scrollToEnd({ animated: true })}
              >
                <View style={styles.manualForm}>
                  <Text style={styles.aiDescHint}>
                    Décris ce que tu as mangé et l'IA remplira le formulaire automatiquement.
                  </Text>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Description</Text>
                    <TextInput
                      style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top' }]}
                      value={textDescription}
                      onChangeText={setTextDescription}
                      onFocus={() => setTimeout(() => descScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                      multiline
                      placeholder="Ex: 2 œufs au plat avec du pain beurré"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <Button
                    label={isAnalyzingText ? 'Analyse en cours...' : '🤖 Analyser et remplir'}
                    onPress={analyzeTextDescription}
                    loading={isAnalyzingText}
                  />
                  {!descFormVisible && !summaryVisible && (
                    <TouchableOpacity onPress={fillManually} style={styles.manualLinkBtn}>
                      <Text style={styles.manualLinkText}>Remplir manuellement</Text>
                    </TouchableOpacity>
                  )}

                  {aiUnavailable && (
                    <View style={styles.aiUnavailableBox}>
                      <Text style={styles.aiUnavailableText}>
                        L'IA est indisponible — saisis les valeurs manuellement
                      </Text>
                    </View>
                  )}

                  {summaryVisible && (
                    <View style={styles.summaryCard}>
                      <View style={styles.summaryHeader}>
                        <Text style={styles.summaryEmoji}>{targetMealEmoji}</Text>
                        <Text style={styles.summaryName}>{manualName}</Text>
                      </View>
                      <Text style={styles.summaryMeta}>{quantity}g · {manualCal} kcal</Text>
                      <Text style={styles.summaryMacros}>
                        P:{manualProt}g G:{manualCarbs}g L:{manualFat}g
                      </Text>
                      <View style={styles.summaryBtnRow}>
                        <View style={{ flex: 1 }}>
                          <Button label="Modifier" variant="secondary" onPress={openEditFromSummary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button label="Confirmer" onPress={addManual} />
                        </View>
                      </View>
                    </View>
                  )}

                  {descFormVisible && (
                    <View style={styles.descFormSection}>
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
                    </View>
                  )}
                </View>
              </ScrollView>
              {descFormVisible && (
                <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                  <Button label="Ajouter au journal" onPress={addManual} />
                </View>
              )}
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Food detail bottom sheet */}
      <KeyboardAwareModal
        visible={foodBottomSheetVisible}
        onClose={() => setFoodBottomSheetVisible(false)}
        footer={selectedFood && (
          <TouchableOpacity
            onPress={() => addFromFood(selectedFood)}
            style={{ backgroundColor: '#10b981', borderRadius: 12, padding: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              Ajouter au journal
            </Text>
          </TouchableOpacity>
        )}
      >
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
          </>
        )}
      </KeyboardAwareModal>
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
  datePillsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 12,
  },
  datePill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Colors.radiusPill, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.bgSurface,
  },
  datePillActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  datePillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  datePillTextActive: { color: Colors.accent },
  j1WaterChipsRow: { flexDirection: 'row', gap: 8 },
  j1WaterChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Colors.radiusPill, borderWidth: 1,
    borderColor: Colors.waterColor, backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  j1WaterChipText: { color: Colors.waterColor, fontWeight: '700', fontSize: 13 },
  j1WaterLogRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  j1WaterLogText: { color: Colors.textPrimary, fontSize: 13 },
  j1WaterLogDelete: { color: Colors.danger, fontSize: 15, paddingHorizontal: 8 },
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
  descScroll: { flexShrink: 1 },
  modalListContent: { padding: 16, paddingBottom: 100 },
  descScrollContent: { padding: 16, paddingBottom: 220 },
  stickyFooter: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
  },
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
  manualLinkBtn: { alignSelf: 'center', paddingVertical: 4 },
  manualLinkText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  aiUnavailableBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.danger, padding: 10,
  },
  aiUnavailableText: { color: Colors.danger, fontSize: 12, textAlign: 'center' },
  descFormSection: {
    gap: 12, marginTop: 4, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  summaryCard: {
    gap: 6, marginTop: 4, padding: 14,
    borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryEmoji: { fontSize: 22 },
  summaryName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
  summaryMeta: { fontSize: 14, color: Colors.accent, fontWeight: '700' },
  summaryMacros: { fontSize: 13, color: Colors.textSecondary },
  summaryBtnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
