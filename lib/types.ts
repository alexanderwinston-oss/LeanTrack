export type Gender = 'homme' | 'femme';
export type ActivityLevel = 'sedentaire' | 'leger' | 'modere' | 'actif' | 'tres_actif';
export type Goal = 'perte' | 'maintien' | 'prise';
export type MealType = 'petit_dejeuner' | 'dejeuner' | 'diner' | 'collation';

export interface UserProfile {
  id?: number;
  name: string;
  age: number;
  gender: Gender;
  weight_current: number;
  weight_target: number;
  height: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_date: string;
  tdee: number;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  water_target: number;
  notifications_enabled: boolean;
  onboarding_completed: boolean;
}

export interface Meal {
  id?: number;
  date: string;
  meal_type: MealType;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'photo' | 'search' | 'manual' | 'plan';
  photo_uri?: string;
}

export interface DailyTotals {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
}

export interface FoodItem {
  name: string;
  brand?: string;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export interface FoodAnalysisResult {
  aliment_principal: string;
  aliments_detectes: string[];
  quantite_estimee_g: number;
  calories_estimees: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
  confiance: 'haute' | 'moyenne' | 'faible';
  remarques: string;
}

export interface MealPlanRepas {
  type: string;
  nom: string;
  description?: string;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
  ingredients: string[];
}

export interface MealPlanDay {
  jour: string;
  total_calories: number;
  repas: MealPlanRepas[];
}

export interface MealPlan {
  plan: MealPlanDay[];
  generated_at?: string;
}

export interface WeightEntry {
  date: string;
  weight: number;
}
