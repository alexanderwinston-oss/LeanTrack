import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { analyzeFoodPhoto } from '@/lib/gemini';
import { useStore } from '@/lib/store';
import { FoodAnalysisResult, MealType } from '@/lib/types';

const TODAY = new Date().toISOString().split('T')[0];

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'petit_dejeuner', label: '🥣 Petit-déj' },
  { key: 'dejeuner', label: '🍽️ Déjeuner' },
  { key: 'diner', label: '🌙 Dîner' },
  { key: 'collation', label: '🍎 Collation' },
];

const PORTIONS = [
  { label: '×0.5', factor: 0.5 },
  { label: '×1', factor: 1 },
  { label: '×1.5', factor: 1.5 },
  { label: '×2', factor: 2 },
];

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string }> = {
  haute: { label: 'Haute confiance', color: Colors.accent },
  moyenne: { label: 'Confiance moyenne', color: Colors.warning },
  faible: { label: 'Faible confiance', color: Colors.danger },
};

export default function PhotoAnalyse() {
  const addMealToStore = useStore((s) => s.addMealToStore);
  const pendingImageBase64 = useStore((s) => s.pendingImageBase64);
  const setPendingImage = useStore((s) => s.setPendingImage);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [portion, setPortion] = useState(1);
  const [mealType, setMealType] = useState<MealType>('dejeuner');

  useEffect(() => {
    if (pendingImageBase64) {
      const b64 = pendingImageBase64;
      setPendingImage(null);
      setRawBase64(b64);
      setImageUri(`data:image/jpeg;base64,${b64}`);
      analyseWithBase64(b64);
    }
  }, []);

  async function analyseWithBase64(b64: string) {
    setAnalyzing(true);
    try {
      const analysis = await analyzeFoodPhoto(b64);
      setResult(analysis);
      setPortion(1);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible d\'analyser cette photo.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie pour continuer.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: false,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setRawBase64(null);
      setResult(null);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la caméra pour continuer.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setRawBase64(null);
      setResult(null);
    }
  }

  async function analyse() {
    if (rawBase64) {
      await analyseWithBase64(rawBase64);
      return;
    }
    if (!imageUri) return;
    setAnalyzing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await analyseWithBase64(base64);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible d\'analyser cette photo.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function addToJournal() {
    if (!result) return;
    await addMealToStore({
      date: TODAY,
      meal_type: mealType,
      food_name: result.aliment_principal,
      quantity_g: Math.round(result.quantite_estimee_g * portion),
      calories: Math.round(result.calories_estimees * portion),
      protein: Math.round(result.proteines_g * portion),
      carbs: Math.round(result.glucides_g * portion),
      fat: Math.round(result.lipides_g * portion),
      source: 'photo',
      photo_uri: imageUri ?? undefined,
    });
    router.back();
  }

  const conf = result ? CONFIDENCE_CONFIG[result.confiance] : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📷 Analyser un repas</Text>
      </View>

      {/* Image preview */}
      <View style={styles.imageArea}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderEmoji}>🍽️</Text>
            <Text style={styles.placeholderText}>Prends ou importe une photo de ton repas</Text>
          </View>
        )}
      </View>

      {/* Photo buttons */}
      <View style={styles.photoBtns}>
        <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
          <Text style={styles.photoBtnEmoji}>📸</Text>
          <Text style={styles.photoBtnText}>Caméra</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery}>
          <Text style={styles.photoBtnEmoji}>🖼️</Text>
          <Text style={styles.photoBtnText}>Galerie</Text>
        </TouchableOpacity>
      </View>

      {imageUri && !result && (
        <Button
          label={analyzing ? 'Analyse en cours...' : '📷 Analyser'}
          onPress={analyse}
          loading={analyzing}
        />
      )}

      {analyzing && (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Analyse en cours...</Text>
        </Card>
      )}

      {result && (
        <>
          {/* Result card */}
          <Card style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultName}>{result.aliment_principal}</Text>
              {conf && (
                <View style={[styles.confBadge, { borderColor: conf.color, backgroundColor: `${conf.color}20` }]}>
                  <Text style={[styles.confText, { color: conf.color }]}>{conf.label}</Text>
                </View>
              )}
            </View>

            {result.aliments_detectes.length > 0 && (
              <Text style={styles.detected}>
                Détectés : {result.aliments_detectes.join(', ')}
              </Text>
            )}

            <View style={styles.macroGrid}>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.accent }]}>
                  {Math.round(result.calories_estimees * portion)}
                </Text>
                <Text style={styles.macroUnit}>kcal</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.proteinColor }]}>
                  {Math.round(result.proteines_g * portion)}g
                </Text>
                <Text style={styles.macroUnit}>Protéines</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.carbsColor }]}>
                  {Math.round(result.glucides_g * portion)}g
                </Text>
                <Text style={styles.macroUnit}>Glucides</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.fatColor }]}>
                  {Math.round(result.lipides_g * portion)}g
                </Text>
                <Text style={styles.macroUnit}>Lipides</Text>
              </View>
            </View>

            <Text style={styles.qty}>Quantité estimée : {Math.round(result.quantite_estimee_g * portion)}g</Text>
            {result.remarques ? <Text style={styles.remarques}>{result.remarques}</Text> : null}
          </Card>

          {/* Portion slider */}
          <Card style={styles.portionCard}>
            <Text style={styles.portionTitle}>Ajuster la portion</Text>
            <View style={styles.portionBtns}>
              {PORTIONS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.portionBtn, portion === p.factor && styles.portionBtnActive]}
                  onPress={() => setPortion(p.factor)}
                >
                  <Text style={[styles.portionBtnText, portion === p.factor && styles.portionBtnTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Meal type selector */}
          <Card style={styles.mealTypeCard}>
            <Text style={styles.portionTitle}>Type de repas</Text>
            <View style={styles.mealTypeBtns}>
              {MEAL_TYPES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.mealTypeBtn, mealType === m.key && styles.mealTypeBtnActive]}
                  onPress={() => setMealType(m.key)}
                >
                  <Text style={[styles.mealTypeBtnText, mealType === m.key && styles.mealTypeBtnTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <Button label="✅ Ajouter au journal" onPress={addToJournal} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 40 },
  header: { gap: 8 },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  imageArea: {
    borderRadius: Colors.radius, overflow: 'hidden',
    height: 220, backgroundColor: Colors.bgSurface,
    borderWidth: 1, borderColor: Colors.border,
  },
  preview: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderEmoji: { fontSize: 48 },
  placeholderText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
  photoBtns: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1, backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius, borderWidth: 1, borderColor: Colors.border,
    padding: 14, alignItems: 'center', gap: 6,
  },
  photoBtnEmoji: { fontSize: 26 },
  photoBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  loadingCard: { alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: Colors.textSecondary },
  resultCard: { gap: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  resultName: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  confBadge: {
    borderRadius: Colors.radiusPill, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  confText: { fontSize: 11, fontWeight: '600' },
  detected: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  macroGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center', gap: 2 },
  macroVal: { fontSize: 20, fontWeight: '700' },
  macroUnit: { fontSize: 11, color: Colors.textSecondary },
  qty: { fontSize: 13, color: Colors.textSecondary },
  remarques: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
  portionCard: { gap: 10 },
  portionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  portionBtns: { flexDirection: 'row', gap: 10 },
  portionBtn: {
    flex: 1, padding: 10, borderRadius: Colors.radius,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  portionBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  portionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  portionBtnTextActive: { color: Colors.accent },
  mealTypeCard: { gap: 10 },
  mealTypeBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealTypeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusPill,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgSurface,
  },
  mealTypeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  mealTypeBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  mealTypeBtnTextActive: { color: Colors.accent },
});
