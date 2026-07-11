import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { analyzeFoodPhoto } from '@/lib/gemini';
import { saveToLeanTrackAlbum, shouldShowPhotoPopup } from '@/lib/media';
import { PhotoSourceModal } from '@/components/PhotoSourceModal';
import { addMeal, addWater } from '@/lib/db';
import { getLocalDateString, showGeminiError } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { registerModal } from '@/lib/useModalManager';
import { FoodAnalysisResult, MealType } from '@/lib/types';

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'petit_dejeuner', label: '🥣 Petit-déj' },
  { key: 'dejeuner', label: '🍽️ Déjeuner' },
  { key: 'diner', label: '🌙 Dîner' },
  { key: 'collation', label: '🍎 Collation' },
];

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string }> = {
  haute: { label: 'Haute confiance', color: Colors.accent },
  moyenne: { label: 'Confiance moyenne', color: Colors.warning },
  faible: { label: 'Faible confiance', color: Colors.danger },
};

export default function PhotoAnalyse() {
  const insets = useSafeAreaInsets();
  const addMealToStore = useStore((s) => s.addMealToStore);
  const pendingImageBase64 = useStore((s) => s.pendingImageBase64);
  const setPendingImage = useStore((s) => s.setPendingImage);
  const currentMealType = useStore((s) => s.currentMealType);
  const pendingMealDate = useStore((s) => s.pendingMealDate);
  const setPendingMealDate = useStore((s) => s.setPendingMealDate);
  const pendingOpenCamera = useStore((s) => s.pendingOpenCamera);
  const setPendingOpenCamera = useStore((s) => s.setPendingOpenCamera);
  const [autoLaunching, setAutoLaunching] = useState(() => pendingOpenCamera);
  registerModal('photoAutoLaunch', autoLaunching, () => router.back(), 10);
  const [targetDate] = useState<string>(() => pendingMealDate ?? getLocalDateString());
  const isYesterdayTarget = targetDate !== getLocalDateString();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const [userComment, setUserComment] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [baseResult, setBaseResult] = useState<FoodAnalysisResult | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [showCustomMultiplier, setShowCustomMultiplier] = useState<boolean>(false);
  const [customMultiplierText, setCustomMultiplierText] = useState<string>('');
  const [mealType, setMealType] = useState<MealType>((currentMealType as MealType) || 'dejeuner');
  const [adjustedVolume, setAdjustedVolume] = useState(250);
  const [showMealTypeSelector, setShowMealTypeSelector] = useState(false);
  const [photoQueue, setPhotoQueue] = useState<{ uri: string; result: FoodAnalysisResult }[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [photoPopupVisible, setPhotoPopupVisible] = useState(false);

  const displayCalories = baseResult ? Math.round(baseResult.calories_estimees * multiplier) : 0;
  const displayProtein = baseResult ? Math.round(baseResult.proteines_g * multiplier * 10) / 10 : 0;
  const displayCarbs = baseResult ? Math.round(baseResult.glucides_g * multiplier * 10) / 10 : 0;
  const displayFat = baseResult ? Math.round(baseResult.lipides_g * multiplier * 10) / 10 : 0;
  const displayQuantity = baseResult ? Math.round(baseResult.quantite_estimee_g * multiplier) : 0;

  useEffect(() => {
    if (pendingImageBase64) {
      const b64 = pendingImageBase64;
      setPendingImage(null);
      setRawBase64(b64);
      const dataUri = `data:image/jpeg;base64,${b64}`;
      setImageUri(dataUri);
      analyseWithBase64(b64, '', dataUri);
    } else if (pendingOpenCamera) {
      setPendingOpenCamera(false);
      takePhoto();
    }
    setPendingMealDate(null);
  }, []);

  async function analyseWithBase64(b64: string | null, comment = '', uri: string | null = null) {
    setAnalyzing(true);
    try {
      const analysis = await analyzeFoodPhoto(b64, comment);
      setResult(analysis);
      setBaseResult(analysis);
      setMultiplier(1);
      setShowCustomMultiplier(false);
      setCustomMultiplierText('');
      const itemUri = uri ?? imageUri;
      if (itemUri) {
        setPhotoQueue([{ uri: itemUri, result: analysis }]);
        setQueueIndex(0);
      }
    } catch (err: any) {
      showGeminiError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  function loadQueueItem(queue: { uri: string; result: FoodAnalysisResult }[], index: number) {
    const item = queue[index];
    if (!item) return;
    setImageUri(item.uri);
    setRawBase64(null);
    setResult(item.result);
    setBaseResult(item.result);
    setMultiplier(1);
    setShowCustomMultiplier(false);
    setCustomMultiplierText('');
    setShowMealTypeSelector(false);
    setMealType((currentMealType as MealType) || 'dejeuner');
  }

  function advanceQueue() {
    const nextIndex = queueIndex + 1;
    if (nextIndex < photoQueue.length) {
      setQueueIndex(nextIndex);
      loadQueueItem(photoQueue, nextIndex);
    } else {
      setPhotoQueue([]);
      setQueueIndex(0);
      router.back();
    }
  }

  async function analyzeBatch(uris: string[]) {
    setIsBatchAnalyzing(true);
    setResult(null);
    setBaseResult(null);
    const collected: { uri: string; result: FoodAnalysisResult }[] = [];
    try {
      for (let i = 0; i < uris.length; i++) {
        setBatchProgress({ current: i + 1, total: uris.length });
        try {
          const base64 = await FileSystem.readAsStringAsync(uris[i], {
            encoding: FileSystem.EncodingType.Base64,
          });
          const analysis = await analyzeFoodPhoto(base64, '');
          collected.push({ uri: uris[i], result: analysis });
        } catch (err: any) {
          showGeminiError(err);
        }
      }
    } finally {
      setIsBatchAnalyzing(false);
      setBatchProgress(null);
    }
    if (collected.length === 0) return;
    setPhotoQueue(collected);
    setQueueIndex(0);
    loadQueueItem(collected, 0);
  }

  async function pickFromGallery() {
    if (await shouldShowPhotoPopup()) {
      setPhotoPopupVisible(true);
    } else {
      openGalleryPicker();
    }
  }

  async function openGalleryPicker() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie pour continuer.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
      base64: false,
      // Android's modern system Photo Picker can retain the previous
      // session's multi-selection across invocations. The legacy picker
      // doesn't have this sticky-selection behavior.
      legacy: true,
    });
    if (res.canceled || res.assets.length === 0) return;

    if (res.assets.length === 1) {
      setImageUri(res.assets[0].uri);
      setRawBase64(null);
      setResult(null);
      setPhotoQueue([]);
      return;
    }

    await analyzeBatch(res.assets.map((a) => a.uri));
  }

  async function takePhoto() {
    try {
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
        saveToLeanTrackAlbum(res.assets[0].uri);
        setImageUri(res.assets[0].uri);
        setRawBase64(null);
        setResult(null);
      }
    } finally {
      setAutoLaunching(false);
    }
  }

  async function analyse() {
    if (rawBase64) {
      await analyseWithBase64(rawBase64, userComment, imageUri);
      return;
    }
    if (!imageUri) return;
    setAnalyzing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setRawBase64(base64);
      await analyseWithBase64(base64, userComment, imageUri);
    } catch (err: any) {
      showGeminiError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyseTextOnly() {
    await analyseWithBase64(null, userComment);
  }

  useEffect(() => {
    if (result?.volume_ml) setAdjustedVolume(result.volume_ml);
  }, [result]);

  async function addToWaterTracker() {
    await addWater(targetDate, adjustedVolume);
    if (!isYesterdayTarget) {
      useStore.getState().refreshDailyData(targetDate);
    }
    Alert.alert('💧 Hydratation', `${adjustedVolume} ml ajoutés à ton hydratation !`, [
      { text: 'Super !', onPress: () => advanceQueue() },
    ]);
  }

  async function addToJournal() {
    if (!baseResult) return;
    const meal = {
      date: targetDate,
      meal_type: mealType,
      food_name: baseResult.aliment_principal,
      quantity_g: displayQuantity,
      calories: displayCalories,
      protein: displayProtein,
      carbs: displayCarbs,
      fat: displayFat,
      source: 'photo' as const,
      photo_uri: imageUri ?? undefined,
      notes: userComment || undefined,
    };
    try {
      if (isYesterdayTarget) {
        await addMeal(meal);
      } else {
        await addMealToStore(meal);
      }
      advanceQueue();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas. Réessaie.');
    }
  }

  const conf = result ? CONFIDENCE_CONFIG[result.confiance] : null;
  const showJournalFooter = !!result && (!result.is_drink || showMealTypeSelector);

  if (autoLaunching) {
    return (
      <View style={[styles.screen, styles.loadingScreen]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📷 Analyser un repas</Text>
        {isYesterdayTarget && (
          <Text style={styles.targetDateNote}>Ajout au journal d'hier</Text>
        )}
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

      {/* Description / comment field */}
      <View style={styles.commentField}>
        <Text style={styles.commentLabel}>Description (optionnelle)</Text>
        <TextInput
          style={styles.commentInput}
          value={userComment}
          onChangeText={setUserComment}
          multiline
          placeholder="Ex: poulet rôti avec riz basmati et légumes vapeur..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      {imageUri && !result && (
        <Button
          label={analyzing ? 'Analyse en cours...' : '📷 Analyser'}
          onPress={analyse}
          loading={analyzing}
        />
      )}

      {!imageUri && userComment.length > 5 && !result && (
        <Button
          label={analyzing ? 'Analyse en cours...' : '📝 Analyser sans photo'}
          onPress={analyseTextOnly}
          loading={analyzing}
        />
      )}

      {analyzing && (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Analyse en cours...</Text>
        </Card>
      )}

      {isBatchAnalyzing && batchProgress && (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>
            Analyse {batchProgress.current} / {batchProgress.total}...
          </Text>
          <Text style={styles.progressSub}>Ne ferme pas l'app</Text>
        </Card>
      )}

      {result && (
        <>
          {photoQueue.length > 1 && (
            <Text style={styles.queueIndicator}>
              Photo {queueIndex + 1} / {photoQueue.length}
            </Text>
          )}
          {/* Result card — always shown */}
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
                <Text style={[styles.macroVal, { color: Colors.accent }]}>{displayCalories}</Text>
                <Text style={styles.macroUnit}>kcal</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.proteinColor }]}>{displayProtein}g</Text>
                <Text style={styles.macroUnit}>Protéines</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.carbsColor }]}>{displayCarbs}g</Text>
                <Text style={styles.macroUnit}>Glucides</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroVal, { color: Colors.fatColor }]}>{displayFat}g</Text>
                <Text style={styles.macroUnit}>Lipides</Text>
              </View>
            </View>

            <Text style={styles.qty}>Quantité estimée : {displayQuantity}g</Text>
            {result.remarques ? <Text style={styles.remarques}>{result.remarques}</Text> : null}
          </Card>

          {result.is_drink && !showMealTypeSelector ? (
            /* ── Drink detected UI ── */
            <Card style={styles.drinkCard}>
              <Text style={styles.drinkBadge}>
                💧 Boisson détectée · {result.volume_ml} ml estimés
              </Text>

              <View style={styles.drinkSliderRow}>
                <Text style={styles.drinkSliderLabel}>
                  Volume : <Text style={{ color: Colors.waterColor, fontWeight: '700' }}>{adjustedVolume} ml</Text>
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={50}
                  maximumValue={1000}
                  step={50}
                  value={adjustedVolume}
                  onValueChange={(v) => setAdjustedVolume(Math.round(v))}
                  minimumTrackTintColor={Colors.waterColor}
                  maximumTrackTintColor={Colors.bgElevated}
                  thumbTintColor={Colors.waterColor}
                />
              </View>

              <TouchableOpacity style={styles.waterBtn} onPress={addToWaterTracker}>
                <Text style={styles.waterBtnText}>💧 Ajouter à l'hydratation ({adjustedVolume} ml)</Text>
              </TouchableOpacity>

              {result.drink_type === 'other' && result.calories_estimees > 0 && (
                <TouchableOpacity style={styles.drinkMealBtn} onPress={() => setShowMealTypeSelector(true)}>
                  <Text style={styles.drinkMealBtnText}>
                    🍹 Ajouter au journal ({result.calories_estimees} kcal)
                  </Text>
                </TouchableOpacity>
              )}
            </Card>
          ) : (
            /* ── Normal food (or caloric drink redirected) UI ── */
            <>
              {/* Portion selector */}
              <Card style={styles.portionCard}>
                <Text style={styles.portionTitle}>Ajuster la portion</Text>
                <View style={styles.portionBtns}>
                  {([0.5, 1, 1.5, 2, 3, 4] as number[]).map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => {
                        setMultiplier(preset);
                        setShowCustomMultiplier(false);
                        setCustomMultiplierText('');
                      }}
                      style={[
                        styles.portionBtn,
                        multiplier === preset && !showCustomMultiplier && styles.portionBtnActive,
                      ]}
                    >
                      <Text style={[
                        styles.portionBtnText,
                        multiplier === preset && !showCustomMultiplier && styles.portionBtnTextActive,
                      ]}>
                        ×{preset}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setShowCustomMultiplier(true);
                      setCustomMultiplierText('');
                    }}
                    style={[styles.portionBtn, showCustomMultiplier && styles.portionBtnActive]}
                  >
                    <Text style={[styles.portionBtnText, showCustomMultiplier && styles.portionBtnTextActive]}>
                      ···
                    </Text>
                  </TouchableOpacity>
                </View>

                {showCustomMultiplier && (
                  <View style={styles.customMultiplierRow}>
                    <Text style={styles.customMultiplierX}>×</Text>
                    <TextInput
                      value={customMultiplierText}
                      onChangeText={(text) => {
                        setCustomMultiplierText(text);
                        const parsed = parseFloat(text.replace(',', '.'));
                        if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                          setMultiplier(parsed);
                        }
                      }}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 6"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.customMultiplierInput}
                      autoFocus
                    />
                    <Text style={styles.customMultiplierPreview}>
                      = {displayQuantity}g · {displayCalories} kcal
                    </Text>
                  </View>
                )}
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
            </>
          )}
        </>
      )}
    </ScrollView>
    {showJournalFooter && (
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Button label="✅ Ajouter au journal" onPress={addToJournal} />
      </View>
    )}
    <PhotoSourceModal
      visible={photoPopupVisible}
      onCancel={() => setPhotoPopupVisible(false)}
      onConfirm={() => { setPhotoPopupVisible(false); openGalleryPicker(); }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgPrimary },
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 40 },
  stickyFooter: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
  },
  header: { gap: 8 },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  targetDateNote: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
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
  commentField: { gap: 6 },
  commentLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  commentInput: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 14,
    padding: 12, minHeight: 70,
  },
  loadingCard: { alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: Colors.textSecondary },
  progressSub: { fontSize: 12, color: Colors.textMuted },
  queueIndicator: {
    fontSize: 13, color: Colors.accent, fontWeight: '700', textAlign: 'center',
  },
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
  portionBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  portionBtnTextActive: { color: Colors.accent },
  customMultiplierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: Colors.bgPrimary, borderRadius: 10, padding: 10,
  },
  customMultiplierX: { color: Colors.textSecondary, fontSize: 16 },
  customMultiplierInput: { flex: 1, color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  customMultiplierPreview: { color: Colors.textMuted, fontSize: 12 },
  mealTypeCard: { gap: 10 },
  mealTypeBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealTypeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radiusPill,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgSurface,
  },
  mealTypeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  mealTypeBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  mealTypeBtnTextActive: { color: Colors.accent },
  drinkCard: { gap: 16 },
  drinkBadge: {
    fontSize: 14, color: Colors.waterColor, fontWeight: '600', textAlign: 'center',
  },
  drinkSliderRow: { gap: 8 },
  drinkSliderLabel: { fontSize: 14, color: Colors.textSecondary },
  slider: { width: '100%', height: 40 },
  waterBtn: {
    backgroundColor: '#0ea5e9', borderRadius: Colors.radius,
    padding: 16, alignItems: 'center',
  },
  waterBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  drinkMealBtn: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  drinkMealBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
});
