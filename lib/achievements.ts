import { AchievementStats } from './types';

export type AchievementCategory =
  | 'Hydratation'
  | 'Nutrition'
  | 'Poids'
  | 'Régularité'
  | 'Résilience'
  | 'Fidélité'
  | 'Volume'
  | 'Secret';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDef {
  id: string;
  emoji: string;
  label: string;
  description: string;
  category: AchievementCategory;
  xp: number;
  tier?: AchievementTier;
  secret?: boolean;
  check: (stats: AchievementStats) => boolean;
  progress?: (stats: AchievementStats) => { current: number; total: number } | null;
}

export const ALL_ACHIEVEMENTS: AchievementDef[] = [

  // ── EARLY WIN ────────────────────────────────────────────────────────────────
  {
    id: 'meal_first', emoji: '🍎', label: 'Premier repas',
    description: 'Enregistre ton premier aliment',
    category: 'Nutrition', xp: 30,
    check: (s) => s.totalMeals >= 1,
  },
  {
    id: 'water_first', emoji: '💧', label: 'Première gorgée',
    description: "Enregistre ta première entrée d'eau",
    category: 'Hydratation', xp: 30,
    check: (s) => s.totalWaterEntries >= 1,
  },
  {
    id: 'weight_first', emoji: '📊', label: 'Premier pas',
    description: 'Enregistre ton premier poids',
    category: 'Poids', xp: 30,
    check: (s) => s.weightEntries >= 1,
  },

  // ── HYDRATATION ──────────────────────────────────────────────────────────────
  {
    id: 'water_goal_1', emoji: '🌊', label: 'Bien hydraté(e)',
    description: 'Atteins ton objectif eau une fois',
    category: 'Hydratation', xp: 40,
    check: (s) => s.waterGoalDaysCount >= 1,
    progress: (s) => ({ current: s.waterGoalDaysCount, total: 1 }),
  },
  {
    id: 'water_goal_7', emoji: '🏄', label: 'Vague',
    description: 'Atteins ton objectif eau 7 jours consécutifs',
    category: 'Hydratation', xp: 90, tier: 'bronze',
    check: (s) => Math.max(s.waterGoalStreak, s.bestWaterGoalStreak) >= 7,
    progress: (s) => ({ current: Math.max(s.waterGoalStreak, s.bestWaterGoalStreak), total: 7 }),
  },
  {
    id: 'water_goal_30', emoji: '🏊', label: 'Immersion',
    description: 'Atteins ton objectif eau 30 jours consécutifs',
    category: 'Hydratation', xp: 200, tier: 'silver',
    check: (s) => Math.max(s.waterGoalStreak, s.bestWaterGoalStreak) >= 30,
    progress: (s) => ({ current: Math.max(s.waterGoalStreak, s.bestWaterGoalStreak), total: 30 }),
  },
  {
    id: 'water_goal_60', emoji: '🐳', label: 'Baleine',
    description: 'Atteins ton objectif eau 60 jours consécutifs',
    category: 'Hydratation', xp: 400, tier: 'gold',
    check: (s) => Math.max(s.waterGoalStreak, s.bestWaterGoalStreak) >= 60,
    progress: (s) => ({ current: Math.max(s.waterGoalStreak, s.bestWaterGoalStreak), total: 60 }),
  },

  // ── NUTRITION — CALORIES ─────────────────────────────────────────────────────
  {
    id: 'calorie_goal_1', emoji: '⭐', label: 'Première victoire',
    description: 'Respecte ton objectif calorique (±10%) une journée',
    category: 'Nutrition', xp: 40,
    check: (s) => s.calorieGoalDays >= 1,
    progress: (s) => ({ current: s.calorieGoalDays, total: 1 }),
  },
  {
    id: 'calorie_goal_7', emoji: '🔥', label: 'Semaine parfaite',
    description: 'Respecte ton objectif (±10%) 7 jours consécutifs',
    category: 'Nutrition', xp: 100, tier: 'bronze',
    check: (s) => Math.max(s.calorieStreak, s.bestCalorieStreak) >= 7,
    progress: (s) => ({ current: Math.max(s.calorieStreak, s.bestCalorieStreak), total: 7 }),
  },
  {
    id: 'calorie_goal_14', emoji: '💫', label: 'Deux semaines',
    description: 'Respecte ton objectif (±10%) 14 jours consécutifs',
    category: 'Nutrition', xp: 200, tier: 'silver',
    check: (s) => Math.max(s.calorieStreak, s.bestCalorieStreak) >= 14,
    progress: (s) => ({ current: Math.max(s.calorieStreak, s.bestCalorieStreak), total: 14 }),
  },
  {
    id: 'calorie_goal_30', emoji: '👑', label: 'Mois de discipline',
    description: 'Respecte ton objectif (±10%) 30 jours consécutifs',
    category: 'Nutrition', xp: 500, tier: 'gold',
    check: (s) => Math.max(s.calorieStreak, s.bestCalorieStreak) >= 30,
    progress: (s) => ({ current: Math.max(s.calorieStreak, s.bestCalorieStreak), total: 30 }),
  },

  // ── NUTRITION — LOGGING STREAK ───────────────────────────────────────────────
  {
    id: 'logging_streak_3', emoji: '📓', label: 'Assidu',
    description: 'Logue tes repas 3 jours consécutifs',
    category: 'Nutrition', xp: 25, tier: 'bronze',
    check: (s) => Math.max(s.loggingStreak, s.bestLoggingStreak) >= 3,
    progress: (s) => ({ current: Math.max(s.loggingStreak, s.bestLoggingStreak), total: 3 }),
  },
  {
    id: 'logging_streak_14', emoji: '📓', label: 'Régulier',
    description: 'Logue tes repas 14 jours consécutifs',
    category: 'Nutrition', xp: 80, tier: 'silver',
    check: (s) => Math.max(s.loggingStreak, s.bestLoggingStreak) >= 14,
    progress: (s) => ({ current: Math.max(s.loggingStreak, s.bestLoggingStreak), total: 14 }),
  },
  {
    id: 'logging_streak_30', emoji: '📓', label: 'Indétrônable',
    description: 'Logue tes repas 30 jours consécutifs',
    category: 'Nutrition', xp: 200, tier: 'gold',
    check: (s) => Math.max(s.loggingStreak, s.bestLoggingStreak) >= 30,
    progress: (s) => ({ current: Math.max(s.loggingStreak, s.bestLoggingStreak), total: 30 }),
  },
  {
    id: 'meal_10_days', emoji: '📋', label: 'Habitude installée',
    description: 'Logue tes repas 10 jours au total',
    category: 'Nutrition', xp: 60,
    check: (s) => s.loggingDays >= 10,
    progress: (s) => ({ current: s.loggingDays, total: 10 }),
  },
  {
    id: 'meal_30_days', emoji: '📅', label: 'Discipline installée',
    description: 'Logue tes repas 30 jours au total',
    category: 'Nutrition', xp: 150,
    check: (s) => s.loggingDays >= 30,
    progress: (s) => ({ current: s.loggingDays, total: 30 }),
  },
  {
    id: 'meal_photo', emoji: '📸', label: 'Gourmand connecté',
    description: 'Analyse un repas en photo',
    category: 'Nutrition', xp: 50,
    check: (s) => s.photoMeals >= 1,
  },
  {
    id: 'no_sugar_week', emoji: '🥗', label: 'Clean Week',
    description: 'Moins de 200g de glucides/jour pendant 7 jours',
    category: 'Nutrition', xp: 120,
    check: (s) => s.lowCarbDays >= 7,
    progress: (s) => ({ current: s.lowCarbDays, total: 7 }),
  },

  // ── NUTRITION — PROTÉINES ────────────────────────────────────────────────────
  {
    id: 'protein_goal_3', emoji: '🥩', label: 'Protéines champion',
    description: 'Objectif protéines (±10%) atteint 3 jours de suite',
    category: 'Nutrition', xp: 40, tier: 'bronze',
    check: (s) => Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak) >= 3,
    progress: (s) => ({ current: Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak), total: 3 }),
  },
  {
    id: 'protein_goal_7', emoji: '🥩', label: 'Protéines elite',
    description: 'Objectif protéines (±10%) atteint 7 jours de suite',
    category: 'Nutrition', xp: 100, tier: 'silver',
    check: (s) => Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak) >= 7,
    progress: (s) => ({ current: Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak), total: 7 }),
  },
  {
    id: 'protein_goal_14', emoji: '🥩', label: 'Machine à protéines',
    description: 'Objectif protéines (±10%) atteint 14 jours de suite',
    category: 'Nutrition', xp: 220, tier: 'gold',
    check: (s) => Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak) >= 14,
    progress: (s) => ({ current: Math.max(s.proteinGoalStreak, s.bestProteinGoalStreak), total: 14 }),
  },

  // ── POIDS ────────────────────────────────────────────────────────────────────
  {
    id: 'weight_minus_1', emoji: '💪', label: '-1 kg',
    description: 'Perds 1 kg par rapport à ton poids initial',
    category: 'Poids', xp: 100,
    check: (s) => s.weightLost >= 1,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 1 }),
  },
  {
    id: 'weight_minus_3', emoji: '🎯', label: '-3 kg',
    description: 'Perds 3 kg par rapport à ton poids initial',
    category: 'Poids', xp: 200,
    check: (s) => s.weightLost >= 3,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 3 }),
  },
  {
    id: 'weight_minus_5', emoji: '🚀', label: '-5 kg',
    description: 'Perds 5 kg par rapport à ton poids initial',
    category: 'Poids', xp: 350,
    check: (s) => s.weightLost >= 5,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 5 }),
  },
  {
    id: 'weight_minus_7', emoji: '⚡', label: '-7 kg',
    description: 'Perds 7 kg par rapport à ton poids initial',
    category: 'Poids', xp: 500,
    check: (s) => s.weightLost >= 7,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 7 }),
  },
  {
    id: 'weight_minus_10', emoji: '🔥', label: '-10 kg',
    description: 'Perds 10 kg par rapport à ton poids initial',
    category: 'Poids', xp: 700,
    check: (s) => s.weightLost >= 10,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 10 }),
  },
  {
    id: 'weight_minus_15', emoji: '💎', label: '-15 kg',
    description: 'Perds 15 kg par rapport à ton poids initial',
    category: 'Poids', xp: 1000,
    check: (s) => s.weightLost >= 15,
    progress: (s) => ({ current: Math.max(0, s.weightLost), total: 15 }),
  },
  {
    id: 'weight_halfway', emoji: '🎯', label: 'Mi-chemin',
    description: 'Atteins 50% de ton objectif de poids',
    category: 'Poids', xp: 400,
    check: (s) => s.progressPercent >= 50,
    progress: (s) => ({ current: Math.min(Math.round(s.progressPercent), 50), total: 50 }),
  },
  {
    id: 'weight_goal', emoji: '🏆', label: 'Objectif atteint !',
    description: 'Atteins ton poids cible',
    category: 'Poids', xp: 2000,
    check: (s) => s.progressPercent >= 100,
    progress: (s) => ({ current: Math.min(Math.round(s.progressPercent), 100), total: 100 }),
  },
  {
    id: 'weight_momentum', emoji: '📉', label: 'Momentum',
    description: '3 pesées consécutives en baisse',
    category: 'Poids', xp: 150,
    check: (s) => s.consecutiveWeightDeclines >= 3,
    progress: (s) => ({ current: s.consecutiveWeightDeclines, total: 3 }),
  },

  // ── RÉGULARITÉ ───────────────────────────────────────────────────────────────
  {
    id: 'streak_3', emoji: '⚡', label: '3 jours de suite',
    description: "Utilise l'app 3 jours consécutifs",
    category: 'Régularité', xp: 25, tier: 'bronze',
    check: (s) => Math.max(s.appStreak, s.bestAppStreak) >= 3,
    progress: (s) => ({ current: Math.max(s.appStreak, s.bestAppStreak), total: 3 }),
  },
  {
    id: 'streak_7', emoji: '🌟', label: 'Une semaine !',
    description: "Utilise l'app 7 jours consécutifs",
    category: 'Régularité', xp: 80, tier: 'silver',
    check: (s) => Math.max(s.appStreak, s.bestAppStreak) >= 7,
    progress: (s) => ({ current: Math.max(s.appStreak, s.bestAppStreak), total: 7 }),
  },
  {
    id: 'streak_30', emoji: '👑', label: '30 jours !',
    description: "Utilise l'app 30 jours consécutifs",
    category: 'Régularité', xp: 300, tier: 'gold',
    check: (s) => Math.max(s.appStreak, s.bestAppStreak) >= 30,
    progress: (s) => ({ current: Math.max(s.appStreak, s.bestAppStreak), total: 30 }),
  },

  // ── RÉSILIENCE ───────────────────────────────────────────────────────────────
  {
    id: 'comeback', emoji: '🔄', label: 'Comeback',
    description: "Reviens et logues après 3 à 5 jours d'absence",
    category: 'Résilience', xp: 80,
    check: (s) => s.hasReturnedAfterAbsence,
  },
  {
    id: 'imparfait_present', emoji: '🤝', label: 'Imparfait mais présent',
    description: 'Logues un jour où tu dépasses ton objectif de 20%',
    category: 'Résilience', xp: 50,
    check: (s) => s.hasLoggedDespiteOvereating,
  },

  // ── VOLUME ───────────────────────────────────────────────────────────────────
  {
    id: 'meal_100', emoji: '💯', label: 'Centenaire',
    description: '100 repas logués au total',
    category: 'Volume', xp: 150,
    check: (s) => s.totalMeals >= 100,
    progress: (s) => ({ current: s.totalMeals, total: 100 }),
  },
  {
    id: 'meal_500', emoji: '🎰', label: '500 repas',
    description: '500 repas logués au total',
    category: 'Volume', xp: 400,
    check: (s) => s.totalMeals >= 500,
    progress: (s) => ({ current: s.totalMeals, total: 500 }),
  },
  {
    id: 'water_100', emoji: '💦', label: '100 verres',
    description: "100 entrées d'eau enregistrées",
    category: 'Volume', xp: 100,
    check: (s) => s.totalWaterEntries >= 100,
    progress: (s) => ({ current: s.totalWaterEntries, total: 100 }),
  },

  // ── FIDÉLITÉ ─────────────────────────────────────────────────────────────────
  {
    id: 'fidelity_7', emoji: '📆', label: 'Une semaine avec toi',
    description: "7 jours d'activité dans l'app",
    category: 'Fidélité', xp: 50,
    check: (s) => s.daysUsingApp >= 7,
    progress: (s) => ({ current: s.daysUsingApp, total: 7 }),
  },
  {
    id: 'fidelity_30', emoji: '🗓️', label: 'Un mois ensemble',
    description: "30 jours d'activité dans l'app",
    category: 'Fidélité', xp: 150,
    check: (s) => s.daysUsingApp >= 30,
    progress: (s) => ({ current: s.daysUsingApp, total: 30 }),
  },
  {
    id: 'fidelity_90', emoji: '🏅', label: 'Trois mois',
    description: "90 jours d'activité dans l'app",
    category: 'Fidélité', xp: 400,
    check: (s) => s.daysUsingApp >= 90,
    progress: (s) => ({ current: s.daysUsingApp, total: 90 }),
  },

  // ── SECRET / EASTER EGGS ─────────────────────────────────────────────────────
  {
    id: 'secret_late_night', emoji: '🦉', label: 'Noctambule',
    description: 'Logues un repas après 23h',
    category: 'Secret', xp: 75, secret: true,
    check: (s) => s.hasLoggedLateNight,
  },
  {
    id: 'secret_early_bird', emoji: '🌅', label: 'Lève-tôt',
    description: 'Logues avant 6h du matin',
    category: 'Secret', xp: 75, secret: true,
    check: (s) => s.hasLoggedEarlyMorning,
  },
  {
    id: 'data_driven', emoji: '🔗', label: 'Data Driven',
    description: 'Connecter LeanTrack à Santé Connect',
    category: 'Secret', xp: 100, secret: true,
    check: (s) => s.hasConnectedHealthConnect,
  },
];
