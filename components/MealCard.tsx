import React, { useState } from 'react';
import {
  Alert, StyleSheet, Text,
  TextInput, TouchableOpacity, View, ViewStyle,
} from 'react-native';
import { registerModal } from '@/lib/useModalManager';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { updateMeal, deleteMeal } from '@/lib/db';
import { Meal, MealType } from '@/lib/types';

const MEAL_TYPE_OPTIONS: { key: MealType; label: string }[] = [
  { key: 'petit_dejeuner', label: '🥣 Petit-déj' },
  { key: 'dejeuner', label: '🍽️ Déjeuner' },
  { key: 'diner', label: '🌙 Dîner' },
  { key: 'collation', label: '🍎 Collation' },
];

interface MealCardProps {
  meal: Meal;
  onMealChanged?: () => void;
  compact?: boolean;
  style?: object;
}

export function MealCard({ meal, onMealChanged, compact = false, style }: MealCardProps) {
  const [detailVisible, setDetailVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState(meal.food_name);
  const [editQty, setEditQty] = useState(String(meal.quantity_g));
  const [editCal, setEditCal] = useState(String(Math.round(meal.calories)));
  const [editProt, setEditProt] = useState(String(Math.round(meal.protein)));
  const [editCarbs, setEditCarbs] = useState(String(Math.round(meal.carbs)));
  const [editFat, setEditFat] = useState(String(Math.round(meal.fat)));
  const [editType, setEditType] = useState<MealType>(meal.meal_type);
  const [editNotes, setEditNotes] = useState(meal.notes ?? '');

  // Portion calc state
  const [originalMeal, setOriginalMeal] = useState<Meal | null>(null);
  const [showPortionCalc, setShowPortionCalc] = useState<boolean>(false);
  const [customPortionText, setCustomPortionText] = useState<string>('');

  registerModal('mealEdit', editing, () => setEditing(false), 10);
  registerModal('mealDetail', detailVisible, () => setDetailVisible(false), 5);

  function openDetail() {
    setEditing(false);
    setEditName(meal.food_name);
    setEditQty(String(meal.quantity_g));
    setEditCal(String(Math.round(meal.calories)));
    setEditProt(String(Math.round(meal.protein)));
    setEditCarbs(String(Math.round(meal.carbs)));
    setEditFat(String(Math.round(meal.fat)));
    setEditType(meal.meal_type);
    setEditNotes(meal.notes ?? '');
    setOriginalMeal({
      ...meal,
      calories: meal.base_calories ?? meal.calories,
      protein: meal.base_protein ?? meal.protein,
      carbs: meal.base_carbs ?? meal.carbs,
      fat: meal.base_fat ?? meal.fat,
      quantity_g: meal.base_quantity_g ?? meal.quantity_g,
    });
    setShowPortionCalc(false);
    setCustomPortionText('');
    setDetailVisible(true);
  }

  async function handleSave() {
    if (!meal.id) return;
    setSaving(true);
    try {
      await updateMeal(meal.id, {
        food_name: editName,
        quantity_g: parseFloat(editQty) || meal.quantity_g,
        calories: parseFloat(editCal) || 0,
        protein: parseFloat(editProt) || 0,
        carbs: parseFloat(editCarbs) || 0,
        fat: parseFloat(editFat) || 0,
        meal_type: editType,
        notes: editNotes,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDetailVisible(false);
      onMealChanged?.();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de modifier ce repas.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Supprimer',
      `Supprimer "${meal.food_name}" (${Math.round(meal.calories)} kcal) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            if (!meal.id) return;
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await deleteMeal(meal.id);
              setDetailVisible(false);
              onMealChanged?.();
            } catch (err: any) {
              Alert.alert('Erreur', err?.message ?? `Impossible de supprimer "${meal.food_name}".`);
            }
          },
        },
      ],
    );
  }

  if (compact) {
    return (
      <>
        <TouchableOpacity onPress={openDetail} activeOpacity={0.8}>
          <Card style={StyleSheet.flatten([styles.compactCard, style]) as ViewStyle}>
            <Text style={styles.compactType} numberOfLines={1}>
              {MEAL_TYPE_OPTIONS.find(m => m.key === meal.meal_type)?.label ?? meal.meal_type}
            </Text>
            <Text style={styles.compactName} numberOfLines={2}>{meal.food_name}</Text>
            <Text style={styles.compactCal}>{Math.round(meal.calories)} kcal</Text>
            <Text style={styles.compactMacros}>
              P:{Math.round(meal.protein)}g G:{Math.round(meal.carbs)}g L:{Math.round(meal.fat)}g
            </Text>
          </Card>
        </TouchableOpacity>
        {renderModal()}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={openDetail} activeOpacity={0.85}>
        <Card style={StyleSheet.flatten([styles.mealItem, style]) as ViewStyle}>
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
          </View>
        </Card>
      </TouchableOpacity>
      {renderModal()}
    </>
  );

  function renderModal() {
    return (
      <KeyboardAwareModal
        visible={detailVisible}
        onClose={() => { if (editing) setEditing(false); else setDetailVisible(false); }}
      >
              {!editing ? (
                <>
                  <Text style={styles.detailName}>{meal.food_name}</Text>
                  <Text style={styles.detailSub}>
                    {MEAL_TYPE_OPTIONS.find(m => m.key === meal.meal_type)?.label} · {meal.quantity_g}g
                  </Text>
                  <Text style={styles.detailCal}>{Math.round(meal.calories)} kcal</Text>
                  <View style={styles.macroRow}>
                    <View style={styles.macroBox}>
                      <Text style={[styles.macroVal, { color: '#60a5fa' }]}>{Math.round(meal.protein)}g</Text>
                      <Text style={styles.macroLabel}>Protéines</Text>
                    </View>
                    <View style={styles.macroBox}>
                      <Text style={[styles.macroVal, { color: '#f59e0b' }]}>{Math.round(meal.carbs)}g</Text>
                      <Text style={styles.macroLabel}>Glucides</Text>
                    </View>
                    <View style={styles.macroBox}>
                      <Text style={[styles.macroVal, { color: '#f87171' }]}>{Math.round(meal.fat)}g</Text>
                      <Text style={styles.macroLabel}>Lipides</Text>
                    </View>
                  </View>
                  {meal.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>📝 Note</Text>
                      <Text style={styles.notesText}>{meal.notes}</Text>
                    </View>
                  ) : null}
                  <View style={styles.actionBtns}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => {
                      setOriginalMeal({
                        ...meal,
                        calories: meal.base_calories ?? meal.calories,
                        protein: meal.base_protein ?? meal.protein,
                        carbs: meal.base_carbs ?? meal.carbs,
                        fat: meal.base_fat ?? meal.fat,
                        quantity_g: meal.base_quantity_g ?? meal.quantity_g,
                      });
                      setShowPortionCalc(false);
                      setCustomPortionText('');
                      setEditName(meal.food_name);
                      setEditQty(String(meal.quantity_g));
                      setEditCal(String(Math.round(meal.calories)));
                      setEditProt(String(Math.round(meal.protein)));
                      setEditCarbs(String(Math.round(meal.carbs)));
                      setEditFat(String(Math.round(meal.fat)));
                      setEditType(meal.meal_type);
                      setEditNotes(meal.notes ?? '');
                      setEditing(true);
                    }}>
                      <Text style={styles.editBtnText}>✏️ Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                      <Text style={styles.deleteBtnText}>🗑️ Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.editTitle}>Modifier le repas</Text>
                  {[
                    { label: 'Nom', value: editName, set: setEditName, kb: 'default' },
                    { label: 'Quantité (g)', value: editQty, set: setEditQty, kb: 'numeric' },
                    { label: 'Calories (kcal)', value: editCal, set: setEditCal, kb: 'numeric' },
                    { label: 'Protéines (g)', value: editProt, set: setEditProt, kb: 'numeric' },
                    { label: 'Glucides (g)', value: editCarbs, set: setEditCarbs, kb: 'numeric' },
                    { label: 'Lipides (g)', value: editFat, set: setEditFat, kb: 'numeric' },
                  ].map(({ label, value, set, kb }) => (
                    <View key={label} style={styles.field}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={value}
                        onChangeText={set as any}
                        keyboardType={kb as any}
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  ))}
                  {/* Quick portion recalculator */}
                  <View style={styles.portionCalcSection}>
                    <TouchableOpacity
                      onPress={() => setShowPortionCalc(!showPortionCalc)}
                      style={styles.portionCalcToggle}
                    >
                      <Text style={styles.portionCalcToggleText}>⚡ Recalcul rapide par portion</Text>
                      <Text style={styles.portionCalcToggleText}>{showPortionCalc ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showPortionCalc && originalMeal && (
                      <View style={{ marginTop: 10 }}>
                        <View style={styles.portionChips}>
                          {([0.5, 1, 1.5, 2, 3, 4] as number[]).map((m) => (
                            <TouchableOpacity
                              key={m}
                              onPress={() => {
                                setEditCal(String(Math.round(originalMeal.calories * m)));
                                setEditProt(String(Math.round(originalMeal.protein * m * 10) / 10));
                                setEditCarbs(String(Math.round(originalMeal.carbs * m * 10) / 10));
                                setEditFat(String(Math.round(originalMeal.fat * m * 10) / 10));
                                setEditQty(String(Math.round(originalMeal.quantity_g * m)));
                              }}
                              style={styles.portionChip}
                            >
                              <Text style={styles.portionChipText}>×{m}</Text>
                            </TouchableOpacity>
                          ))}
                          <TouchableOpacity
                            onPress={() => setCustomPortionText('custom')}
                            style={styles.portionChip}
                          >
                            <Text style={styles.portionChipText}>···</Text>
                          </TouchableOpacity>
                        </View>

                        {customPortionText === 'custom' && (
                          <View style={styles.customPortionRow}>
                            <Text style={styles.customPortionX}>×</Text>
                            <TextInput
                              keyboardType="decimal-pad"
                              placeholder="Multiplicateur custom (ex: 6)"
                              placeholderTextColor={Colors.textMuted}
                              onChangeText={(text) => {
                                const parsed = parseFloat(text.replace(',', '.'));
                                if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                                  setEditCal(String(Math.round(originalMeal.calories * parsed)));
                                  setEditProt(String(Math.round(originalMeal.protein * parsed * 10) / 10));
                                  setEditCarbs(String(Math.round(originalMeal.carbs * parsed * 10) / 10));
                                  setEditFat(String(Math.round(originalMeal.fat * parsed * 10) / 10));
                                  setEditQty(String(Math.round(originalMeal.quantity_g * parsed)));
                                }
                              }}
                              style={styles.customPortionInput}
                              autoFocus
                            />
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Type de repas</Text>
                    <View style={styles.typeRow}>
                      {MEAL_TYPE_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.typeBtn, editType === opt.key && styles.typeBtnActive]}
                          onPress={() => setEditType(opt.key)}
                        >
                          <Text style={[styles.typeBtnText, editType === opt.key && styles.typeBtnTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      style={[styles.fieldInput, { minHeight: 60 }]}
                      value={editNotes}
                      onChangeText={setEditNotes}
                      multiline
                      placeholder="Note optionnelle..."
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={styles.editBtns}>
                    <Button label="Annuler" onPress={() => {
                      setEditing(false);
                      setShowPortionCalc(false);
                      setCustomPortionText('');
                      setOriginalMeal(null);
                    }} variant="ghost" />
                    <View style={{ flex: 1 }}>
                      <Button label="Enregistrer" onPress={handleSave} loading={saving} />
                    </View>
                  </View>
                </>
              )}
      <TouchableOpacity style={styles.closeRow} onPress={() => setDetailVisible(false)}>
        <Text style={styles.closeText}>Fermer</Text>
      </TouchableOpacity>
      </KeyboardAwareModal>
    );
  }
}

const styles = StyleSheet.create({
  compactCard: { width: 150, gap: 6 },
  compactType: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  compactName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, lineHeight: 19 },
  compactCal: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  compactMacros: { fontSize: 11, color: Colors.textSecondary },
  mealItem: { paddingVertical: 10, paddingHorizontal: 12 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  mealDetails: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  mealRight: { alignItems: 'flex-end' },
  mealCal: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  mealCalUnit: { fontSize: 11, color: Colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '85%',
  },
  detailName: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  detailSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  detailCal: { color: '#10b981', fontSize: 42, fontWeight: '800', marginVertical: 12 },
  macroRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  macroBox: {
    flex: 1, backgroundColor: '#0f172a',
    borderRadius: 10, padding: 10, alignItems: 'center',
  },
  macroVal: { fontSize: 18, fontWeight: '700' },
  macroLabel: { color: Colors.textSecondary, fontSize: 11 },
  notesBox: { backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16 },
  notesLabel: { color: Colors.textSecondary, fontSize: 12 },
  notesText: { color: Colors.textPrimary, fontSize: 14, marginTop: 4 },
  actionBtns: { flexDirection: 'row', gap: 12 },
  editBtn: {
    flex: 1, backgroundColor: '#334155', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  editBtnText: { color: Colors.textPrimary, fontWeight: '600' },
  deleteBtn: {
    flex: 1, backgroundColor: '#7f1d1d', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  deleteBtnText: { color: '#fca5a5', fontWeight: '600' },
  editTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  field: { gap: 6, marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  fieldInput: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 15, padding: 12,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: Colors.radiusPill, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.bgSurface,
  },
  typeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  typeBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  typeBtnTextActive: { color: Colors.accent },
  editBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  closeRow: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  closeText: { color: Colors.textMuted, fontSize: 15 },
  portionCalcSection: {
    marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Colors.radius, overflow: 'hidden',
  },
  portionCalcToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bgElevated, paddingHorizontal: 12, paddingVertical: 10,
  },
  portionCalcToggleText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  portionChips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  portionChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Colors.radiusPill, borderWidth: 1.5,
    borderColor: Colors.accent, backgroundColor: Colors.accentSubtle,
  },
  portionChipText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  customPortionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  customPortionX: { fontSize: 18, color: Colors.accent, fontWeight: '700' },
  customPortionInput: {
    flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.accent, color: Colors.textPrimary,
    fontSize: 15, padding: 10,
  },
});
