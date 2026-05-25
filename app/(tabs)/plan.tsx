import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useStore } from '@/lib/store';
import { getMealPlan, saveMealPlan, addMeal } from '@/lib/db';
import { generateMealPlan } from '@/lib/gemini';
import { MealPlan, MealPlanItem, MealType } from '@/lib/types';

const TODAY = new Date().toISOString().split('T')[0];
const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const MEAL_TYPE_MAP: Record<string, MealType> = {
  petit_dejeuner: 'petit_dejeuner',
  dejeuner: 'dejeuner',
  diner: 'diner',
  collation: 'collation',
};

function MealCard({
  meal,
  mealType,
  onAdd,
}: {
  meal: MealPlanItem;
  mealType: MealType;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={styles.mealCard}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <View style={styles.mealCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mealCardName}>{meal.nom}</Text>
            <Text style={styles.mealCardMacros}>
              P:{meal.proteines_g}g · G:{meal.glucides_g}g · L:{meal.lipides_g}g
            </Text>
          </View>
          <View style={styles.mealCardRight}>
            <Text style={styles.mealCardCal}>{meal.calories}</Text>
            <Text style={styles.mealCardCalUnit}>kcal</Text>
          </View>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.mealDetails}>
          <Text style={styles.ingredientsTitle}>Ingrédients :</Text>
          {meal.ingredients.map((ing, i) => (
            <Text key={i} style={styles.ingredient}>• {ing}</Text>
          ))}
          {meal.preparation && (
            <>
              <Text style={styles.ingredientsTitle}>Préparation :</Text>
              <Text style={styles.preparation}>{meal.preparation}</Text>
            </>
          )}
          <TouchableOpacity style={styles.addToJournalBtn} onPress={onAdd}>
            <Text style={styles.addToJournalText}>+ Ajouter au journal</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

export default function Plan() {
  const insets = useSafeAreaInsets();
  const profile = useStore((s) => s.profile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getMealPlan().then(setPlan);
    }, [])
  );

  async function generate() {
    if (!profile) return;
    setGenerating(true);
    try {
      const newPlan = await generateMealPlan(
        profile.calorie_target,
        profile.protein_target,
        profile.carbs_target,
        profile.fat_target,
        profile.goal
      );
      await saveMealPlan(JSON.stringify(newPlan));
      setPlan(newPlan);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de générer le plan. Réessaie.');
    } finally {
      setGenerating(false);
    }
  }

  async function addToJournal(item: MealPlanItem, mealType: MealType) {
    await addMeal({
      date: TODAY,
      meal_type: mealType,
      food_name: item.nom,
      quantity_g: 0,
      calories: item.calories,
      protein: item.proteines_g,
      carbs: item.glucides_g,
      fat: item.lipides_g,
      source: 'plan',
    });
    await refreshDailyData(TODAY);
    Alert.alert('✅', 'Repas ajouté au journal !');
  }

  const currentDay = plan?.jours[selectedDay];

  if (!plan) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📅 Mon plan alimentaire</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>Aucun plan généré</Text>
          <Text style={styles.emptySubtitle}>
            Génère un plan alimentaire personnalisé sur 7 jours adapté à tes objectifs
          </Text>
          <Button
            label="Générer mon plan"
            onPress={generate}
            loading={generating}
          />
        </View>
      </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📅 Mon plan alimentaire</Text>
      </View>

      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs} contentContainerStyle={styles.dayTabsContent}>
        {DAY_LABELS.map((day, i) => (
          <Pressable
            key={day}
            style={[styles.dayTab, selectedDay === i && styles.dayTabActive]}
            onPress={() => setSelectedDay(i)}
          >
            <Text style={[styles.dayTabText, selectedDay === i && styles.dayTabTextActive]}>
              {day.slice(0, 3)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 70 }]}>
        {currentDay && (
          <>
            <View style={styles.daySummary}>
              <Text style={styles.daySummaryTitle}>{currentDay.jour}</Text>
              <Text style={styles.daySummaryCal}>{currentDay.total_calories} kcal</Text>
            </View>

            {[
              { key: 'petit_dejeuner', label: '🥣 Petit-déjeuner', meal: currentDay.petit_dejeuner },
              { key: 'dejeuner', label: '🍽️ Déjeuner', meal: currentDay.dejeuner },
              { key: 'diner', label: '🌙 Dîner', meal: currentDay.diner },
              ...(currentDay.collation ? [{ key: 'collation', label: '🍎 Collation', meal: currentDay.collation }] : []),
            ].map(({ key, label, meal }) => (
              <View key={key} style={styles.mealSection}>
                <Text style={styles.mealSectionTitle}>{label}</Text>
                <MealCard
                  meal={meal}
                  mealType={key as MealType}
                  onAdd={() => addToJournal(meal, key as MealType)}
                />
              </View>
            ))}
          </>
        )}

        <View style={styles.regenRow}>
          {generating ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Button label="🔄 Régénérer le plan" onPress={generate} variant="secondary" />
          )}
        </View>
      </ScrollView>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  dayTabs: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayTabsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  dayTab: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: Colors.radiusPill,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1, borderColor: Colors.border,
  },
  dayTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayTabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  dayTabTextActive: { color: '#fff' },
  scroll: { padding: 20, gap: 16 },
  daySummary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  daySummaryTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  daySummaryCal: { fontSize: 15, color: Colors.accent, fontWeight: '600' },
  mealSection: { gap: 8 },
  mealSectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  mealCard: { gap: 0, padding: 12 },
  mealCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealCardName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  mealCardMacros: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  mealCardRight: { alignItems: 'flex-end', marginRight: 6 },
  mealCardCal: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  mealCardCalUnit: { fontSize: 11, color: Colors.textSecondary },
  chevron: { fontSize: 10, color: Colors.textMuted },
  mealDetails: { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  ingredientsTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
  ingredient: { fontSize: 13, color: Colors.textSecondary, paddingLeft: 4, lineHeight: 20 },
  preparation: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  addToJournalBtn: {
    marginTop: 8, backgroundColor: Colors.accentSubtle, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.accent, padding: 10, alignItems: 'center',
  },
  addToJournalText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
  regenRow: { alignItems: 'center', marginTop: 8 },
});
