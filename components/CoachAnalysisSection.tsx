import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { useFeatureUnlocked } from '@/lib/featureFlags';
import {
  deleteCoachAnalysis, getCoachAnalysis, getMealNamesForRange, getWeightEntriesForRange,
  saveCoachAnalysis,
} from '@/lib/db';
import { CoachAnalysisDayInput, generateCoachAnalysis, safeParseJSON } from '@/lib/gemini';
import { getGeminiErrorContent } from '@/lib/utils';
import { CoachAnalysis, DailyEntry } from '@/lib/types';

interface Props {
  weekOffset: number;
  weekStart: string;
  weekEnd: string;
  days: DailyEntry[];
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTarget: number;
  goal: string;
}

const EMPTY_ANALYSIS: CoachAnalysis = {
  resume: '', points_forts: [], points_faibles: [], recommandations: [],
};

function formatGeneratedAt(dbDatetime: string): string {
  const d = new Date(dbDatetime.replace(' ', 'T'));
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isSundayEvening(): boolean {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() >= 19;
}

export function CoachAnalysisSection({
  weekOffset, weekStart, weekEnd, days,
  calorieTarget, proteinTarget, carbsTarget, fatTarget, waterTarget, goal,
}: Props) {
  const unlocked = useFeatureUnlocked('AI_COACH');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<CoachAnalysis | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeDaysCount = days.filter((d) => d.total_calories > 0).length;
  const isInProgress = weekOffset === 0;
  const isLastCompleted = weekOffset === -1;
  // In-progress week is normally hidden entirely — Sunday 19h+ is the one exception,
  // where the current week is treated like a completed one for preview purposes.
  const blockAutoGenerate = isInProgress && !isSundayEvening();

  // Guards against a second concurrent Gemini call for the same week (e.g. two
  // overlapping focus/mount cycles) — generate() is only ever entered once per
  // week while a request is in flight.
  const generatingWeekRef = useRef<string | null>(null);

  // Plain functions (not useCallback) so they always close over the latest
  // props/state from the render that invokes them — the effect below is what
  // controls *when* a reload happens, not memoization of these functions.
  async function generate() {
    if (generatingWeekRef.current === weekStart) return;
    generatingWeekRef.current = weekStart;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const [mealRows, weightEntries] = await Promise.all([
        getMealNamesForRange(weekStart, weekEnd),
        getWeightEntriesForRange(weekStart, weekEnd),
      ]);
      const mealsByDate = new Map<string, string[]>();
      mealRows.forEach((r) => {
        const list = mealsByDate.get(r.date) ?? [];
        list.push(r.food_name);
        mealsByDate.set(r.date, list);
      });
      const dayInputs: CoachAnalysisDayInput[] = days.map((d) => ({
        date: d.date,
        total_calories: d.total_calories,
        total_protein: d.total_protein,
        total_carbs: d.total_carbs,
        total_fat: d.total_fat,
        water_ml: d.water_ml,
        meal_names: mealsByDate.get(d.date) ?? [],
      }));
      const result = await generateCoachAnalysis(
        dayInputs,
        { calorieTarget, proteinTarget, carbsTarget, fatTarget, waterTarget },
        weightEntries,
        goal
      );
      await saveCoachAnalysis(weekStart, JSON.stringify(result));
      const saved = await getCoachAnalysis(weekStart);
      setAnalysis(result);
      setGeneratedAt(saved?.created_at ?? null);
    } catch (err: any) {
      const isQuota = err?.message === 'QUOTA_EXCEEDED';
      setErrorMsg(isQuota ? 'Notre coach IA est débordé ! Donne-lui 2 minutes et il sera de retour en pleine forme. 🧠' : getGeminiErrorContent(err).message);
    } finally {
      setGenerating(false);
      generatingWeekRef.current = null;
    }
  }

  async function load() {
    if (!unlocked) { setLoading(false); return; }
    setLoading(true);
    setErrorMsg(null);
    setAnalysis(null);
    setGeneratedAt(null);
    try {
      const cached = await getCoachAnalysis(weekStart);
      if (cached) {
        setAnalysis(safeParseJSON<CoachAnalysis>(cached.analysis_json, EMPTY_ANALYSIS));
        setGeneratedAt(cached.created_at);
        return;
      }
      if (!blockAutoGenerate && (isLastCompleted || isSundayEvening()) && activeDaysCount >= 3) {
        await generate();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Reload whenever the displayed week or unlock state changes — activeDaysCount
    // is derived from `days`, which itself changes only when the week's data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, weekStart, isInProgress, isLastCompleted, activeDaysCount]);

  function confirmRegenerate() {
    Alert.alert(
      '🔄 On repart !',
      'On relance le cerveau ! Ton coach IA va tout reprendre depuis le début. 🧠',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'C\'est parti !',
          onPress: async () => {
            await deleteCoachAnalysis(weekStart);
            await generate();
          },
        },
      ]
    );
  }

  const isBusy = loading || generating;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>🤖 Coach IA</Text>

      {blockAutoGenerate && (
        <Text style={styles.hint}>
          L'analyse est disponible pour les semaines terminées — reviens une fois cette semaine finie.
        </Text>
      )}

      {!blockAutoGenerate && isBusy && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.loadingText}>Analyse de ta semaine en cours...</Text>
        </View>
      )}

      {!blockAutoGenerate && !isBusy && !analysis && !errorMsg && activeDaysCount < 3 && (
        <Text style={styles.hint}>
          Pas assez de données cette semaine pour une analyse (minimum 3 jours loggés).
        </Text>
      )}

      {!blockAutoGenerate && !isBusy && !analysis && !errorMsg && activeDaysCount >= 3 && !isLastCompleted && (
        <View style={{ gap: 10 }}>
          <Text style={styles.hint}>Aucune analyse générée pour cette semaine.</Text>
          <TouchableOpacity style={styles.generateBtn} onPress={confirmRegenerate}>
            <Text style={styles.generateBtnText}>Générer l'analyse</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!errorMsg && !isBusy && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={confirmRegenerate}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!analysis && !isBusy && !errorMsg && (
        <View style={{ gap: 12 }}>
          {!!analysis.resume && <Text style={styles.resume}>{analysis.resume}</Text>}

          {analysis.points_forts.length > 0 && (
            <View style={{ gap: 4 }}>
              {analysis.points_forts.map((p, i) => (
                <Text key={i} style={styles.listItem}>✅ {p}</Text>
              ))}
            </View>
          )}

          {analysis.points_faibles.length > 0 && (
            <View style={{ gap: 4 }}>
              {analysis.points_faibles.map((p, i) => (
                <Text key={i} style={styles.listItem}>⚠️ {p}</Text>
              ))}
            </View>
          )}

          {analysis.recommandations.length > 0 && (
            <View style={styles.recoBox}>
              {analysis.recommandations.map((r, i) => (
                <Text key={i} style={styles.recoItem}>💡 {r}</Text>
              ))}
            </View>
          )}

          <View style={styles.footerRow}>
            <Text style={styles.footerDate}>
              {generatedAt
                ? (isInProgress
                    ? 'Analyse générée le dimanche soir — semaine en cours'
                    : `Analyse générée le ${formatGeneratedAt(generatedAt)}`)
                : ''}
            </Text>
            <TouchableOpacity onPress={confirmRegenerate}>
              <Text style={styles.regenBtn}>🔄 Regénérer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontSize: 13, color: Colors.textSecondary },
  generateBtn: {
    alignSelf: 'flex-start', backgroundColor: Colors.accentSubtle,
    borderRadius: Colors.radiusPill, borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  generateBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.danger, padding: 12, gap: 8,
  },
  errorText: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
  retryBtn: { alignSelf: 'flex-start' },
  retryBtnText: { color: Colors.danger, fontWeight: '700', fontSize: 13 },
  resume: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  listItem: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  recoBox: {
    backgroundColor: Colors.accentSubtle, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.accent, padding: 12, gap: 6,
  },
  recoItem: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19, fontWeight: '500' },
  footerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerDate: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  regenBtn: { color: Colors.accent, fontSize: 12, fontWeight: '600' },
});
