import React, { useCallback, useState } from 'react';
import {
  Alert, FlatList, Modal, ScrollView, Share, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { saveRecipe, getRecipes, deleteRecipe } from '@/lib/db';
import { generateRecipe } from '@/lib/gemini';
import { useStore } from '@/lib/store';
import { GeneratedRecipe, Recipe, RecipeIngredient } from '@/lib/types';

type Tab = 'recipes' | 'generate' | 'shopping';

function parseIngredients(json: string): RecipeIngredient[] {
  try { return JSON.parse(json) as RecipeIngredient[]; } catch { return []; }
}
function parseSteps(json: string): string[] {
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

export default function Recettes() {
  const insets = useSafeAreaInsets();
  const profile = useStore((s) => s.profile);

  const [activeTab, setActiveTab] = useState<Tab>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // generate tab
  const [genDescription, setGenDescription] = useState('');
  const [genServings, setGenServings] = useState('2');
  const [genIngredients, setGenIngredients] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null);
  const [saving, setSaving] = useState(false);

  // shopping tab
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // detail modal
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [detailServings, setDetailServings] = useState(2);
  const [cookingChecked, setCookingChecked] = useState<Record<number, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  useFocusEffect(useCallback(() => { loadRecipes(); }, []));

  async function loadRecipes() {
    const r = await getRecipes();
    setRecipes(r);
  }

  async function handleGenerate() {
    if (!genDescription.trim()) {
      Alert.alert('Description requise', 'Décris le repas que tu souhaites créer.');
      return;
    }
    setGenerating(true);
    setGeneratedRecipe(null);
    try {
      const result = await generateRecipe(
        genDescription,
        parseInt(genServings) || 2,
        profile?.calorie_target ?? 2000,
        genIngredients || undefined
      );
      setGeneratedRecipe(result);
    } catch {
      Alert.alert('Erreur', 'Impossible de générer la recette. Vérifie ta connexion.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveRecipe() {
    if (!generatedRecipe) return;
    setSaving(true);
    try {
      await saveRecipe({
        name: generatedRecipe.name,
        description: generatedRecipe.description,
        servings: generatedRecipe.servings,
        calories_per_serving: generatedRecipe.calories_per_serving,
        protein_g: generatedRecipe.protein_g,
        carbs_g: generatedRecipe.carbs_g,
        fat_g: generatedRecipe.fat_g,
        prep_time_minutes: generatedRecipe.prep_time_minutes,
        cook_time_minutes: generatedRecipe.cook_time_minutes,
        ingredients_json: JSON.stringify(generatedRecipe.ingredients),
        steps_json: JSON.stringify(generatedRecipe.steps),
      });
      await loadRecipes();
      setGeneratedRecipe(null);
      setGenDescription('');
      setActiveTab('recipes');
      Alert.alert('✅', 'Recette sauvegardée !');
    } finally {
      setSaving(false);
    }
  }

  function handleLongPress(recipe: Recipe) {
    Alert.alert(
      'Supprimer la recette',
      `Supprimer "${recipe.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            if (!recipe.id) return;
            await deleteRecipe(recipe.id);
            await loadRecipes();
          },
        },
      ]
    );
  }

  function openDetail(recipe: Recipe) {
    setDetailRecipe(recipe);
    setDetailServings(recipe.servings);
    setCookingChecked({});
    setCompletedSteps({});
  }

  // Shopping list helpers
  const allIngredients = recipes.flatMap((r) => parseIngredients(r.ingredients_json));
  const uniqueIngredients = Array.from(
    new Map(allIngredients.map((i) => [i.name.toLowerCase(), i])).values()
  );
  const neededCount = uniqueIngredients.filter((i) => !checkedItems[i.name.toLowerCase()]).length;

  async function shareShoppingList() {
    const needed = uniqueIngredients.filter((i) => !checkedItems[i.name.toLowerCase()]);
    if (needed.length === 0) {
      Alert.alert('', 'Tu as tout ce qu\'il faut !');
      return;
    }
    const text = needed
      .map((i) => `• ${i.quantity} ${i.unit} de ${i.name}`.trim())
      .join('\n');
    await Share.share({ message: `🛒 Liste de courses :\n\n${text}` });
  }

  function renderRecipesTab() {
    if (recipes.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🍳</Text>
          <Text style={styles.emptyTitle}>Aucune recette sauvegardée</Text>
          <Text style={styles.emptySubtitle}>
            Va dans "Générer" pour créer ta première recette avec l'IA
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        data={recipes}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: recipe }) => (
          <TouchableOpacity
            onPress={() => openDetail(recipe)}
            onLongPress={() => handleLongPress(recipe)}
            activeOpacity={0.8}
          >
            <Card style={styles.recipeCard}>
              <Text style={styles.recipeName}>{recipe.name}</Text>
              {recipe.description ? (
                <Text style={styles.recipeDesc} numberOfLines={2}>{recipe.description}</Text>
              ) : null}
              <View style={styles.recipeMeta}>
                <View style={styles.recipeMetaItem}>
                  <Text style={styles.recipeMetaValue}>{recipe.calories_per_serving}</Text>
                  <Text style={styles.recipeMetaLabel}>kcal/portion</Text>
                </View>
                <View style={styles.recipeMetaItem}>
                  <Text style={styles.recipeMetaValue}>{recipe.servings}</Text>
                  <Text style={styles.recipeMetaLabel}>portions</Text>
                </View>
                {recipe.prep_time_minutes > 0 && (
                  <View style={styles.recipeMetaItem}>
                    <Text style={styles.recipeMetaValue}>{recipe.prep_time_minutes + recipe.cook_time_minutes}</Text>
                    <Text style={styles.recipeMetaLabel}>min total</Text>
                  </View>
                )}
              </View>
              <Text style={styles.recipeLongPressHint}>Appui long pour supprimer</Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    );
  }

  function renderGenerateTab() {
    return (
      <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Décris le repas souhaité</Text>
        <TextInput
          value={genDescription}
          onChangeText={setGenDescription}
          placeholder="Ex: Poulet rôti aux herbes avec légumes de saison..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          style={styles.genTextarea}
        />
        <Text style={styles.sectionLabel}>Nombre de portions</Text>
        <TextInput
          value={genServings}
          onChangeText={setGenServings}
          keyboardType="number-pad"
          style={styles.genInput}
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.sectionLabel}>Ingrédients disponibles (optionnel)</Text>
        <TextInput
          value={genIngredients}
          onChangeText={setGenIngredients}
          placeholder="Ex: poulet, riz, brocoli..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={2}
          style={styles.genTextarea}
        />
        <Button
          label="✨ Créer la recette"
          onPress={handleGenerate}
          loading={generating}
        />

        {generatedRecipe && (
          <View style={styles.generatedBlock}>
            <Text style={styles.generatedTitle}>{generatedRecipe.name}</Text>
            {generatedRecipe.description ? (
              <Text style={styles.generatedDesc}>{generatedRecipe.description}</Text>
            ) : null}
            <View style={styles.recipeMeta}>
              <View style={styles.recipeMetaItem}>
                <Text style={styles.recipeMetaValue}>{generatedRecipe.calories_per_serving}</Text>
                <Text style={styles.recipeMetaLabel}>kcal/portion</Text>
              </View>
              <View style={styles.recipeMetaItem}>
                <Text style={[styles.recipeMetaValue, { color: Colors.proteinColor }]}>{generatedRecipe.protein_g}g</Text>
                <Text style={styles.recipeMetaLabel}>protéines</Text>
              </View>
              <View style={styles.recipeMetaItem}>
                <Text style={[styles.recipeMetaValue, { color: Colors.carbsColor }]}>{generatedRecipe.carbs_g}g</Text>
                <Text style={styles.recipeMetaLabel}>glucides</Text>
              </View>
              <View style={styles.recipeMetaItem}>
                <Text style={[styles.recipeMetaValue, { color: Colors.fatColor }]}>{generatedRecipe.fat_g}g</Text>
                <Text style={styles.recipeMetaLabel}>lipides</Text>
              </View>
            </View>
            <Text style={styles.ingredientsTitle}>Ingrédients :</Text>
            {generatedRecipe.ingredients.map((ing, i) => (
              <Text key={i} style={styles.ingredientText}>
                • {ing.quantity} {ing.unit} de {ing.name}
              </Text>
            ))}
            <Text style={[styles.ingredientsTitle, { marginTop: 12 }]}>Préparation :</Text>
            {generatedRecipe.steps.map((step, i) => (
              <Text key={i} style={styles.stepText}>{step}</Text>
            ))}
            <View style={{ marginTop: 16 }}>
              <Button label="💾 Sauvegarder la recette" onPress={handleSaveRecipe} loading={saving} />
            </View>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderShoppingTab() {
    if (uniqueIngredients.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Aucun ingrédient</Text>
          <Text style={styles.emptySubtitle}>Sauvegarde des recettes pour générer ta liste de courses.</Text>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.shoppingHeader}>
          <Text style={styles.shoppingCount}>
            {neededCount} ingrédient{neededCount > 1 ? 's' : ''} à acheter
          </Text>
          <TouchableOpacity onPress={shareShoppingList} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>📤 Partager</Text>
          </TouchableOpacity>
        </View>
        {uniqueIngredients.map((ing) => {
          const key = ing.name.toLowerCase();
          const checked = checkedItems[key] ?? false;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setCheckedItems((prev) => ({ ...prev, [key]: !checked }))}
              style={[styles.shoppingItem, checked && styles.shoppingItemChecked]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.shoppingIngredient, checked && styles.shoppingIngredientChecked]}>
                {ing.quantity} {ing.unit} {ing.name}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => setCheckedItems({})}
        >
          <Text style={styles.clearBtnText}>Tout décocher</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  const detailIngredients = detailRecipe ? parseIngredients(detailRecipe.ingredients_json) : [];
  const detailSteps = detailRecipe ? parseSteps(detailRecipe.steps_json) : [];
  const servingsRatio = detailRecipe ? detailServings / (detailRecipe.servings || 1) : 1;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🍳 Mes recettes</Text>
      </View>

      <View style={styles.tabs}>
        {(['recipes', 'generate', 'shopping'] as Tab[]).map((tab) => {
          const labels = { recipes: '📚 Recettes', generate: '✨ Générer', shopping: '🛒 Courses' };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'recipes' && renderRecipesTab()}
        {activeTab === 'generate' && renderGenerateTab()}
        {activeTab === 'shopping' && renderShoppingTab()}
      </View>

      {/* Recipe detail modal */}
      <Modal
        visible={detailRecipe !== null}
        animationType="slide"
        onRequestClose={() => setDetailRecipe(null)}
      >
        {detailRecipe && (
          <View style={[styles.detailModal, { paddingTop: insets.top }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle} numberOfLines={2}>{detailRecipe.name}</Text>
              <TouchableOpacity onPress={() => setDetailRecipe(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Servings counter */}
            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>Portions :</Text>
              <TouchableOpacity
                onPress={() => setDetailServings((s) => Math.max(1, s - 1))}
                style={styles.servingsBtn}
              >
                <Text style={styles.servingsBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.servingsValue}>{detailServings}</Text>
              <TouchableOpacity
                onPress={() => setDetailServings((s) => s + 1)}
                style={styles.servingsBtn}
              >
                <Text style={styles.servingsBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.servingsBase}>(recette pour {detailRecipe.servings})</Text>
            </View>

            <ScrollView contentContainerStyle={styles.detailContent}>
              {detailRecipe.description ? (
                <Text style={styles.detailDesc}>{detailRecipe.description}</Text>
              ) : null}

              {/* Macros card */}
              <Card style={styles.detailMacros}>
                {[
                  { label: `${Math.round(detailRecipe.calories_per_serving * servingsRatio)} kcal`, sub: 'total', color: Colors.accent },
                  { label: `${Math.round(detailRecipe.protein_g * servingsRatio)}g`, sub: 'protéines', color: Colors.proteinColor },
                  { label: `${Math.round(detailRecipe.carbs_g * servingsRatio)}g`, sub: 'glucides', color: Colors.carbsColor },
                  { label: `${Math.round(detailRecipe.fat_g * servingsRatio)}g`, sub: 'lipides', color: Colors.fatColor },
                ].map((m) => (
                  <View key={m.sub} style={styles.detailMacroBox}>
                    <Text style={[styles.detailMacroVal, { color: m.color }]}>{m.label}</Text>
                    <Text style={styles.detailMacroSub}>{m.sub}</Text>
                  </View>
                ))}
              </Card>

              {/* Time info */}
              {(detailRecipe.prep_time_minutes > 0 || detailRecipe.cook_time_minutes > 0) && (
                <View style={styles.timeRow}>
                  {detailRecipe.prep_time_minutes > 0 && (
                    <Text style={styles.timeText}>⏱ Prep: {detailRecipe.prep_time_minutes} min</Text>
                  )}
                  {detailRecipe.cook_time_minutes > 0 && (
                    <Text style={styles.timeText}>🔥 Cuisson: {detailRecipe.cook_time_minutes} min</Text>
                  )}
                </View>
              )}

              {/* Ingredients */}
              <Text style={styles.sectionLabel}>Ingrédients</Text>
              {detailIngredients.map((ing, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setCookingChecked((prev) => ({ ...prev, [i]: !prev[i] }))}
                  style={[styles.detailIngRow, cookingChecked[i] && styles.detailIngRowChecked]}
                >
                  <View style={[styles.checkbox, cookingChecked[i] && styles.checkboxChecked]}>
                    {cookingChecked[i] && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <Text style={[styles.detailIngText, cookingChecked[i] && styles.detailIngTextChecked]}>
                    {ing.quantity} {ing.unit} {ing.name}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Steps */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Préparation</Text>
              {detailSteps.map((step, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setCompletedSteps((prev) => ({ ...prev, [i]: !prev[i] }))}
                  style={[styles.stepRow, completedSteps[i] && styles.stepRowDone]}
                >
                  <Text style={[styles.stepText, completedSteps[i] && styles.stepTextDone]}>
                    {step}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.accent, fontWeight: '700' },
  listContent: { padding: 16, gap: 12 },
  recipeCard: { gap: 8 },
  recipeName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  recipeDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  recipeMeta: { flexDirection: 'row', gap: 16 },
  recipeMetaItem: { alignItems: 'center', gap: 2 },
  recipeMetaValue: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  recipeMetaLabel: { fontSize: 11, color: Colors.textMuted },
  recipeLongPressHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, marginTop: 60 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  genTextarea: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 14, padding: 12, minHeight: 70, textAlignVertical: 'top', marginBottom: 12,
  },
  genInput: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 15, padding: 12, marginBottom: 12,
  },
  generatedBlock: {
    backgroundColor: Colors.bgSurface, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginTop: 16, gap: 4,
  },
  generatedTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  generatedDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  ingredientsTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginTop: 8 },
  ingredientText: { fontSize: 13, color: Colors.textSecondary, paddingLeft: 4, lineHeight: 20 },
  stepText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, paddingLeft: 4 },
  shoppingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  shoppingCount: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  shareBtn: {
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radiusPill,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.accent,
  },
  shareBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  shoppingItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  shoppingItemChecked: { opacity: 0.5 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shoppingIngredient: { fontSize: 14, color: Colors.textPrimary, flex: 1 },
  shoppingIngredientChecked: { textDecorationLine: 'line-through', color: Colors.textMuted },
  clearBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  clearBtnText: { color: Colors.textMuted, fontSize: 13 },
  detailModal: { flex: 1, backgroundColor: Colors.bgPrimary },
  detailHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.bgSurface, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.textSecondary, fontSize: 16 },
  servingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  servingsLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  servingsBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.bgSurface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  servingsBtnText: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  servingsValue: { fontSize: 18, fontWeight: '800', color: Colors.accent, minWidth: 24, textAlign: 'center' },
  servingsBase: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  detailContent: { padding: 20, gap: 4 },
  detailDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  detailMacros: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12 },
  detailMacroBox: { alignItems: 'center', gap: 2 },
  detailMacroVal: { fontSize: 16, fontWeight: '700' },
  detailMacroSub: { fontSize: 11, color: Colors.textMuted },
  timeRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  timeText: { fontSize: 13, color: Colors.textSecondary },
  detailIngRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailIngRowChecked: { opacity: 0.5 },
  detailIngText: { fontSize: 14, color: Colors.textPrimary, flex: 1 },
  detailIngTextChecked: { textDecorationLine: 'line-through', color: Colors.textMuted },
  stepRow: {
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
    borderRadius: 4,
  },
  stepRowDone: { opacity: 0.5 },
  stepTextDone: { textDecorationLine: 'line-through' },
});
