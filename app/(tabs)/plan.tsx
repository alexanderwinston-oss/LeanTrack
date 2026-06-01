import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ScreenContainer, BOTTOM_SPACER_HEIGHT } from '@/components/ScreenContainer';
import { useStore } from '@/lib/store';
import { getMealPlan, saveMealPlan, addMeal, getProfile } from '@/lib/db';
import { generateMealPlan, callGemini, extractText, safeParseJSON } from '@/lib/gemini';
import { MealPlan, MealPlanRepas, MealType } from '@/lib/types';
import { getLocalDateString, showGeminiError } from '@/lib/utils';

const TODAY = getLocalDateString();
const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const MEAL_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  petit_dejeuner: { label: 'Petit-déjeuner', emoji: '🥣' },
  dejeuner: { label: 'Déjeuner', emoji: '🍽️' },
  diner: { label: 'Dîner', emoji: '🌙' },
  collation: { label: 'Collation', emoji: '🍎' },
};

function PlanMealCard({
  meal,
  onAdd,
  onRegenerate,
  isRegenerating,
  anyRegenerating,
}: {
  meal: MealPlanRepas;
  onAdd: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  anyRegenerating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={styles.mealCard}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <View style={styles.mealCardHeader}>
          <View style={{ flex: 1, paddingRight: 36 }}>
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

      <TouchableOpacity
        onPress={onRegenerate}
        disabled={anyRegenerating}
        style={[styles.regenBtn, { opacity: anyRegenerating ? 0.5 : 1 }]}
      >
        <Text style={styles.regenBtnText}>{isRegenerating ? '⏳' : '🔄'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.mealDetails}>
          {meal.description ? (
            <Text style={styles.preparation}>{meal.description}</Text>
          ) : null}
          <Text style={styles.ingredientsTitle}>Ingrédients :</Text>
          {meal.ingredients.map((ing, i) => (
            <Text key={i} style={styles.ingredient}>• {ing}</Text>
          ))}
          <TouchableOpacity style={styles.addToJournalBtn} onPress={onAdd}>
            <Text style={styles.addToJournalText}>+ Ajouter au journal</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

export default function Plan() {
  const profile = useStore((s) => s.profile);
  const refreshDailyData = useStore((s) => s.refreshDailyData);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  const [regeneratingMealKey, setRegeneratingMealKey] = useState<string | null>(null);
  const [showPlanSettings, setShowPlanSettings] = useState(false);
  const [ingredientList, setIngredientList] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');

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
        profile.goal,
        ingredientList || undefined,
        dailyBudget ? parseFloat(dailyBudget) : undefined
      );
      await saveMealPlan(JSON.stringify(newPlan));
      setPlan(newPlan);
    } catch (err) {
      showGeminiError(err);
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateSingleMeal(dayIndex: number, mealType: string): Promise<void> {
    const key = `${dayIndex}-${mealType}`;
    setRegeneratingMealKey(key);
    try {
      const p = await getProfile();
      if (!p || !plan) return;

      const data = await callGemini({
        contents: [{
          parts: [{
            text: `Génère UN SEUL repas de type "${mealType}" pour :
- Objectif journalier : ${p.calorie_target} kcal
- Protéines cible : ${p.protein_target}g | Glucides : ${p.carbs_target}g | Lipides : ${p.fat_target}g
${ingredientList ? `- CONTRAINTE : utilise UNIQUEMENT ces ingrédients disponibles : ${ingredientList}` : '- Cuisine française, supermarché classique'}
${dailyBudget ? `- CONTRAINTE BUDGET : coût de ce repas max ${(parseFloat(dailyBudget) / 4).toFixed(0)}€` : ''}
- Ne pas répéter les repas déjà présents ce jour-là dans le plan.

RÈGLE NOM (STRICTE ET NON NÉGOCIABLE) : Le champ "nom" = noms des aliments uniquement, 2-4 mots max. Exemples valides : "Fromage blanc amandes", "Oeufs brouillés pain". Exemples invalides : "Déjeuner du midi", tout adjectif qualitatif.

Retourne UNIQUEMENT ce JSON sans markdown :
{
  "type": "${mealType}",
  "nom": "string",
  "description": "string",
  "calories": number,
  "proteines_g": number,
  "glucides_g": number,
  "lipides_g": number,
  "ingredients": ["string avec quantité"]
}`,
          }],
        }],
      }, true, 0);

      const newMeal = safeParseJSON<MealPlanRepas | null>(extractText(data), null);
      if (newMeal) {
        const updatedPlan: MealPlan = JSON.parse(JSON.stringify(plan));
        const dayPlan = updatedPlan.plan[dayIndex];
        if (dayPlan) {
          const mealIndex = dayPlan.repas.findIndex((m) => m.type === mealType);
          if (mealIndex >= 0) {
            dayPlan.repas[mealIndex] = newMeal;
          } else {
            dayPlan.repas.push(newMeal);
          }
          dayPlan.total_calories = dayPlan.repas.reduce((sum, m) => sum + (m.calories ?? 0), 0);
        }
        setPlan(updatedPlan);
        await saveMealPlan(JSON.stringify(updatedPlan));
      }
    } catch (err) {
      showGeminiError(err);
    } finally {
      setRegeneratingMealKey(null);
    }
  }

  async function addToJournal(item: MealPlanRepas) {
    await addMeal({
      date: TODAY,
      meal_type: (item.type as MealType) || 'dejeuner',
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

  const currentDay = plan?.plan[selectedDay];

  if (!plan) {
    return (
      <ScreenContainer>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>📅 Mon plan alimentaire</Text>
          </View>
          <ScrollView contentContainerStyle={styles.emptyScroll}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>Aucun plan généré</Text>
              <Text style={styles.emptySubtitle}>
                Génère un plan alimentaire personnalisé sur 7 jours adapté à tes objectifs
              </Text>
            </View>

            {/* Settings panel */}
            <TouchableOpacity
              onPress={() => setShowPlanSettings(!showPlanSettings)}
              style={styles.settingsToggle}
            >
              <Text style={styles.settingsToggleText}>⚙️ Paramètres du plan</Text>
              <Text style={styles.settingsToggleText}>{showPlanSettings ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showPlanSettings && renderSettings()}

            <Button label="Générer mon plan" onPress={generate} loading={generating} />

            <TouchableOpacity style={styles.recipesBtn} onPress={() => router.push('/recettes')}>
              <Text style={styles.recipesBtnText}>🍳 Mes recettes</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </ScreenContainer>
    );
  }

  function renderSettings() {
    return (
      <View style={styles.settingsPanel}>
        <Text style={styles.settingsSectionTitle}>🥕 Mes ingrédients disponibles</Text>
        <TextInput
          value={ingredientList}
          onChangeText={setIngredientList}
          placeholder="Ex: poulet, riz, brocoli, oeufs, yaourt grec..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          style={styles.settingsTextarea}
        />
        <Text style={styles.settingsHint}>
          Laisse vide pour un plan libre sans contrainte d'ingrédients.
        </Text>
        <Text style={[styles.settingsSectionTitle, { marginTop: 12 }]}>💰 Budget journalier (€)</Text>
        <TextInput
          value={dailyBudget}
          onChangeText={setDailyBudget}
          placeholder="Ex: 15"
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.settingsInput}
        />
        <Text style={styles.settingsHint}>
          Laisse vide pour aucune contrainte budgétaire.
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📅 Mon plan alimentaire</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} style={styles.dayTabs} contentContainerStyle={styles.dayTabsContent}>
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

        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 110 }]}>
          {currentDay && (
            <>
              <View style={styles.daySummary}>
                <Text style={styles.daySummaryTitle}>{currentDay.jour}</Text>
                <Text style={styles.daySummaryCal}>{currentDay.total_calories} kcal</Text>
              </View>

              {currentDay.repas.map((repas) => {
                const typeInfo = MEAL_TYPE_LABELS[repas.type] ?? { label: repas.type, emoji: '🍽️' };
                return (
                  <View key={repas.type} style={styles.mealSection}>
                    <Text style={styles.mealSectionTitle}>{typeInfo.emoji} {typeInfo.label}</Text>
                    <PlanMealCard
                      meal={repas}
                      onAdd={() => addToJournal(repas)}
                      onRegenerate={() => regenerateSingleMeal(selectedDay, repas.type)}
                      isRegenerating={regeneratingMealKey === `${selectedDay}-${repas.type}`}
                      anyRegenerating={regeneratingMealKey !== null}
                    />
                  </View>
                );
              })}
            </>
          )}

          {/* Settings panel */}
          <TouchableOpacity
            onPress={() => setShowPlanSettings(!showPlanSettings)}
            style={styles.settingsToggle}
          >
            <Text style={styles.settingsToggleText}>⚙️ Paramètres du plan</Text>
            <Text style={styles.settingsToggleText}>{showPlanSettings ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showPlanSettings && renderSettings()}

          <View style={styles.regenRow}>
            {generating ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Button label="🔄 Régénérer le plan" onPress={generate} variant="secondary" />
            )}
          </View>

          <TouchableOpacity style={styles.recipesBtn} onPress={() => router.push('/recettes')}>
            <Text style={styles.recipesBtnText}>🍳 Mes recettes</Text>
          </TouchableOpacity>

          <View style={{ height: BOTTOM_SPACER_HEIGHT }} />
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyScroll: { padding: 20, gap: 16, alignItems: 'stretch' },
  emptyState: { alignItems: 'center', gap: 16, paddingVertical: 20 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  settingsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 12,
  },
  settingsToggleText: { color: Colors.accent, fontSize: 14 },
  settingsPanel: {
    backgroundColor: Colors.bgSurface, borderRadius: 12,
    padding: 16, marginBottom: 8,
  },
  settingsSectionTitle: { color: Colors.textPrimary, fontWeight: '600', marginBottom: 6, fontSize: 14 },
  settingsTextarea: {
    backgroundColor: Colors.bgElevated, borderRadius: 10,
    padding: 12, color: Colors.textPrimary, fontSize: 13,
    minHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: Colors.border,
  },
  settingsInput: {
    backgroundColor: Colors.bgElevated, borderRadius: 10,
    padding: 12, color: Colors.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingsHint: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  recipesBtn: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  recipesBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  dayTabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
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
  regenBtn: {
    position: 'absolute', top: 8, right: 8,
    padding: 6, borderRadius: 8,
    backgroundColor: Colors.bgElevated,
    zIndex: 1,
  },
  regenBtnText: { fontSize: 14 },
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
