import { AchievementStats } from './types';

export interface AchievementDef {
  id: string;
  emoji: string;
  label: string;
  description: string;
  category: 'Hydratation' | 'Nutrition' | 'Poids' | 'Régularité';
  check: (stats: AchievementStats) => boolean;
}

export const ALL_ACHIEVEMENTS: AchievementDef[] = [
  // Hydratation
  {
    id: 'water_first', emoji: '💧', label: 'Première gorgée',
    description: 'Enregistre ta première entrée d\'eau',
    category: 'Hydratation',
    check: (s) => s.totalWaterEntries >= 1,
  },
  {
    id: 'water_goal_1', emoji: '🌊', label: 'Bien hydraté(e)',
    description: 'Atteins ton objectif eau une fois',
    category: 'Hydratation',
    check: (s) => s.waterGoalDaysCount >= 1,
  },
  {
    id: 'water_goal_7', emoji: '🏄', label: 'Hydro Warrior',
    description: 'Atteins ton objectif eau 7 jours consécutifs',
    category: 'Hydratation',
    check: (s) => s.waterGoalStreak >= 7,
  },
  {
    id: 'water_goal_30', emoji: '🏆', label: 'Hydro Master',
    description: 'Atteins ton objectif eau 30 jours consécutifs',
    category: 'Hydratation',
    check: (s) => s.waterGoalStreak >= 30,
  },
  // Nutrition
  {
    id: 'meal_first', emoji: '🍎', label: 'Premier repas',
    description: 'Enregistre ton premier aliment',
    category: 'Nutrition',
    check: (s) => s.totalMeals >= 1,
  },
  {
    id: 'meal_photo', emoji: '📸', label: 'Gourmand connecté',
    description: 'Analyse un repas en photo',
    category: 'Nutrition',
    check: (s) => s.photoMeals >= 1,
  },
  {
    id: 'meal_10_days', emoji: '📋', label: 'Habitude installée',
    description: 'Logue tes repas 10 jours',
    category: 'Nutrition',
    check: (s) => s.loggingDays >= 10,
  },
  {
    id: 'calorie_goal_1', emoji: '⭐', label: 'Première victoire',
    description: 'Respecte ton objectif calorique une journée',
    category: 'Nutrition',
    check: (s) => s.calorieGoalDays >= 1,
  },
  {
    id: 'calorie_goal_7', emoji: '🔥', label: 'Semaine parfaite',
    description: 'Respecte ton objectif 7 jours consécutifs',
    category: 'Nutrition',
    check: (s) => s.calorieStreak >= 7,
  },
  {
    id: 'calorie_goal_30', emoji: '💫', label: 'Mois de discipline',
    description: 'Respecte ton objectif 30 jours consécutifs',
    category: 'Nutrition',
    check: (s) => s.calorieStreak >= 30,
  },
  {
    id: 'no_sugar_week', emoji: '🥗', label: 'Clean Week',
    description: 'Moins de 200g de glucides/jour pendant 7 jours',
    category: 'Nutrition',
    check: (s) => s.lowCarbDays >= 7,
  },
  // Poids
  {
    id: 'weight_first', emoji: '📊', label: 'Premier pas',
    description: 'Enregistre ton premier poids',
    category: 'Poids',
    check: (s) => s.weightEntries >= 1,
  },
  {
    id: 'weight_minus_1', emoji: '💪', label: '-1 kg',
    description: 'Perds 1 kg par rapport à ton poids initial',
    category: 'Poids',
    check: (s) => s.weightLost >= 1,
  },
  {
    id: 'weight_minus_3', emoji: '🎯', label: '-3 kg',
    description: 'Perds 3 kg par rapport à ton poids initial',
    category: 'Poids',
    check: (s) => s.weightLost >= 3,
  },
  {
    id: 'weight_minus_5', emoji: '🚀', label: '-5 kg',
    description: 'Perds 5 kg par rapport à ton poids initial',
    category: 'Poids',
    check: (s) => s.weightLost >= 5,
  },
  {
    id: 'weight_halfway', emoji: '🎯', label: 'Mi-chemin',
    description: 'Atteins 50% de ton objectif de poids',
    category: 'Poids',
    check: (s) => s.progressPercent >= 50,
  },
  {
    id: 'weight_goal', emoji: '🏆', label: 'Objectif atteint !',
    description: 'Atteins ton poids cible',
    category: 'Poids',
    check: (s) => s.progressPercent >= 100,
  },
  // Régularité
  {
    id: 'streak_3', emoji: '⚡', label: '3 jours de suite',
    description: 'Utilise l\'app 3 jours consécutifs',
    category: 'Régularité',
    check: (s) => s.appStreak >= 3,
  },
  {
    id: 'streak_7', emoji: '🌟', label: 'Une semaine !',
    description: 'Utilise l\'app 7 jours consécutifs',
    category: 'Régularité',
    check: (s) => s.appStreak >= 7,
  },
  {
    id: 'streak_30', emoji: '👑', label: '30 jours !',
    description: 'Utilise l\'app 30 jours consécutifs',
    category: 'Régularité',
    check: (s) => s.appStreak >= 30,
  },
];
