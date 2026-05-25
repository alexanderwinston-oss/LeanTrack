import React, { useCallback, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, router } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useStore } from '@/lib/store';
import { deleteMeal, getMealsForDate } from '@/lib/db';
import { searchFood } from '@/lib/openfoodfacts';
import { FoodItem, Meal, MealType } from '@/lib/types';

const TODAY = new Date().toISOString().split('T')[0];

const SECTIONS: { type: MealType; label: string; emoji: string }[] = [
  { type: 'petit_dejeuner', label: 'Petit-déjeuner', emoji: '🥣' },
  { type: 'dejeuner', label: 'Déjeuner', emoji: '🍽️' },
  { type: 'diner', label: 'Dîner', emoji: '🌙' },
  { type: 'collation', label: 'Collation', emoji: '🍎' },
];

export default function Journal() {
  const insets = useSafeAreaInsets();
  const meals = useStore((s) => s.meals);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const addMealToStore = useStore((s) => s.addMealToStore);
  const dailyTotals = useStore((s) => s.dailyTotals);

  const setPendingImage = useStore((s) => s.setPendingImage);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeMealType, setActiveMealType] = useState<MealType>('dejeuner');

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [quantity, setQuantity] = useState('100');

  // Manual entry state
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualProt, setManualProt] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshDailyData(TODAY);
    }, [])
  );

  async function pickFromGalleryAndAnalyse() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie pour continuer.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setPendingImage(res.assets[0].base64);
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
      setModalVisible(false);
      router.push('/photo-analyse');
    }
  }

  function openAdd(type: MealType) {
    setActiveMealType(type);
    setQuery('');
    setResults([]);
    setSelected(null);
    setQuantity('100');
    setManual(false);
    setModalVisible(true);
  }

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await searchFood(query);
      setResults(r);
    } catch {
      Alert.alert('Erreur', 'Impossible de rechercher. Vérifie ta connexion.');
    } finally {
      setSearching(false);
    }
  }

  async function addFromFood(food: FoodItem) {
    const q = parseFloat(quantity) || 100;
    const factor = q / 100;
    const meal: Meal = {
      date: TODAY,
      meal_type: activeMealType,
      food_name: food.name,
      quantity_g: q,
      calories: Math.round(food.calories_100g * factor),
      protein: Math.round(food.protein_100g * factor),
      carbs: Math.round(food.carbs_100g * factor),
      fat: Math.round(food.fat_100g * factor),
      source: 'search',
    };
    await addMealToStore(meal);
    setModalVisible(false);
  }

  async function addManual() {
    if (!manualName.trim()) return;
    const meal: Meal = {
      date: TODAY,
      meal_type: activeMealType,
      food_name: manualName,
      quantity_g: parseFloat(quantity) || 100,
      calories: parseFloat(manualCal) || 0,
      protein: parseFloat(manualProt) || 0,
      carbs: parseFloat(manualCarbs) || 0,
      fat: parseFloat(manualFat) || 0,
      source: 'manual',
    };
    await addMealToStore(meal);
    setModalVisible(false);
  }

  async function handleDelete(id: number) {
    Alert.alert('Supprimer', 'Supprimer ce repas ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(id);
          await refreshDailyData(TODAY);
        },
      },
    ]);
  }

  const mealsByType = (type: MealType) => meals.filter((m) => m.meal_type === type);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Journal du {format(new Date(), 'd MMMM', { locale: fr })}</Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>{dailyTotals.calories} kcal</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 70 }]}>
        {SECTIONS.map(({ type, label, emoji }) => (
          <View key={type} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{emoji} {label}</Text>
              <Text style={styles.sectionCals}>
                {Math.round(mealsByType(type).reduce((s, m) => s + m.calories, 0))} kcal
              </Text>
            </View>

            {mealsByType(type).map((meal) => (
              <Card key={meal.id} style={styles.mealItem}>
                <View style={styles.mealRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealName}>{meal.food_name}</Text>
                    <Text style={styles.mealDetails}>
                      {meal.quantity_g}g · P:{Math.round(meal.protein)}g G:{Math.round(meal.carbs)}g L:{Math.round(meal.fat)}g
                    </Text>
                  </View>
                  <View style={styles.mealRight}>
                    <Text style={styles.mealCal}>{Math.round(meal.calories)}</Text>
                    <Text style={styles.mealCalUnit}>kcal</Text>
                  </View>
                  <TouchableOpacity onPress={() => meal.id && handleDelete(meal.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={() => openAdd(type)}>
              <Text style={styles.addBtnText}>+ Ajouter un aliment</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Add food modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
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

          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, !manual && styles.modeTabActive]}
              onPress={() => setManual(false)}
            >
              <Text style={[styles.modeTabText, !manual && styles.modeTabTextActive]}>🔍 Recherche</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, manual && styles.modeTabActive]}
              onPress={() => setManual(true)}
            >
              <Text style={[styles.modeTabText, manual && styles.modeTabTextActive]}>✏️ Manuel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {!manual ? (
              <>
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

                {results.map((food, i) => (
                  <Pressable
                    key={i}
                    style={[styles.foodItem, selected === food && styles.foodItemSelected]}
                    onPress={() => setSelected(food)}
                  >
                    <Text style={styles.foodName}>{food.name}</Text>
                    {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}
                    <Text style={styles.foodMacros}>
                      {Math.round(food.calories_100g)} kcal · P:{food.protein_100g}g G:{food.carbs_100g}g L:{food.fat_100g}g / 100g
                    </Text>
                  </Pressable>
                ))}

                {selected && (
                  <Card style={styles.qtyCard}>
                    <Text style={styles.qtyLabel}>Quantité (g)</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="numeric"
                    />
                    <Button label="Ajouter au journal" onPress={() => addFromFood(selected)} />
                  </Card>
                )}
              </>
            ) : (
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
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
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
  mealItem: { paddingVertical: 10, paddingHorizontal: 12 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  mealDetails: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  mealRight: { alignItems: 'flex-end' },
  mealCal: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  mealCalUnit: { fontSize: 11, color: Colors.textSecondary },
  deleteBtn: { padding: 6 },
  deleteText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
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
  modeTabs: { flexDirection: 'row', padding: 16, gap: 12 },
  modeTab: {
    flex: 1, padding: 10, borderRadius: Colors.radius,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  modeTabActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  modeTabText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  modeTabTextActive: { color: Colors.accent },
  modalScroll: { flex: 1, padding: 16 },
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
  qtyCard: { marginTop: 12, gap: 12 },
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
});
