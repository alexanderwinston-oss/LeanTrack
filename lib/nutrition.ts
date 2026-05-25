import { ActivityLevel, Goal, UserProfile } from './types';
import { differenceInWeeks, parseISO } from 'date-fns';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentaire: 1.2,
  leger: 1.375,
  modere: 1.55,
  actif: 1.725,
  tres_actif: 1.9,
};

export function calcBMR(weight: number, height: number, age: number, gender: 'homme' | 'femme'): number {
  // Mifflin-St Jeor
  const base = 10 * weight + 6.25 * height - 5 * age;
  return gender === 'homme' ? base + 5 : base - 161;
}

export function calcTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calcCalorieTarget(tdee: number, goal: Goal): number {
  if (goal === 'perte') return Math.max(1200, tdee - 500);
  if (goal === 'prise') return tdee + 300;
  return tdee;
}

export function calcMacros(calorieTarget: number, weightTarget: number) {
  const protein_g = Math.round(weightTarget * 2);
  const protein_kcal = protein_g * 4;
  const fat_kcal = Math.round(calorieTarget * 0.3);
  const fat_g = Math.round(fat_kcal / 9);
  const carbs_kcal = calorieTarget - protein_kcal - fat_kcal;
  const carbs_g = Math.round(Math.max(0, carbs_kcal) / 4);
  return { protein_g, carbs_g, fat_g };
}

export function calcWater(weight: number): number {
  return Math.max(1500, Math.round(weight * 35));
}

export function calcProjection(
  weightCurrent: number,
  weightTarget: number,
  tdee: number,
  calorieTarget: number,
  targetDate: string
): Array<{ date: string; weight: number }> {
  const weeklyDeficit = (tdee - calorieTarget) * 7;
  const weeklyChange = weeklyDeficit / 7700; // 7700 kcal ≈ 1 kg fat
  const today = new Date();
  const end = parseISO(targetDate);
  const totalWeeks = Math.max(1, differenceInWeeks(end, today));

  const points: Array<{ date: string; weight: number }> = [];
  for (let w = 0; w <= totalWeeks; w++) {
    const d = new Date(today);
    d.setDate(d.getDate() + w * 7);
    const projected = weightCurrent - weeklyChange * w;
    const clamped = weightTarget < weightCurrent
      ? Math.max(weightTarget, projected)
      : Math.min(weightTarget, projected);
    points.push({ date: d.toISOString().split('T')[0], weight: Math.round(clamped * 10) / 10 });
  }
  return points;
}

export function calcFullProfile(inputs: {
  name: string;
  age: number;
  gender: 'homme' | 'femme';
  weight_current: number;
  weight_target: number;
  height: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_date: string;
}): Omit<UserProfile, 'notifications_enabled' | 'onboarding_completed'> {
  const bmr = calcBMR(inputs.weight_current, inputs.height, inputs.age, inputs.gender);
  const tdee = calcTDEE(bmr, inputs.activity_level);
  const calorie_target = calcCalorieTarget(tdee, inputs.goal);
  const { protein_g, carbs_g, fat_g } = calcMacros(calorie_target, inputs.weight_target);
  const water_target = calcWater(inputs.weight_current);

  return {
    ...inputs,
    tdee,
    calorie_target,
    protein_target: protein_g,
    carbs_target: carbs_g,
    fat_target: fat_g,
    water_target,
  };
}
