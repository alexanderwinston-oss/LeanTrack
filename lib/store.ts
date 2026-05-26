import { create } from 'zustand';
import { DailyTotals, Meal, UserProfile } from './types';
import { addMeal as dbAddMeal, addWater as dbAddWater, getDailyTotals, getMealsForDate, getProfile, getWaterForDate, switchProfile } from './db';

interface AppState {
  profile: UserProfile | null;
  dailyTotals: DailyTotals;
  meals: Meal[];
  waterMl: number;
  pendingImageBase64: string | null;
  currentMealType: string;
  setProfile: (profile: UserProfile) => void;
  refreshDailyData: (date: string) => Promise<void>;
  addMealToStore: (meal: Meal) => Promise<void>;
  addWaterToStore: (date: string, ml: number) => Promise<void>;
  setPendingImage: (b64: string | null) => void;
  setCurrentMealType: (type: string) => void;
  switchProfileInStore: (profileId: string) => Promise<void>;
}

const emptyTotals = (date: string): DailyTotals => ({
  date, calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0,
});

export const useStore = create<AppState>((set, get) => ({
  profile: null,
  dailyTotals: emptyTotals(new Date().toISOString().split('T')[0]),
  meals: [],
  waterMl: 0,
  pendingImageBase64: null,
  currentMealType: 'dejeuner',

  setProfile: (profile) => set({ profile }),
  setPendingImage: (b64) => set({ pendingImageBase64: b64 }),
  setCurrentMealType: (type) => set({ currentMealType: type }),

  refreshDailyData: async (date: string) => {
    const [totals, meals, water] = await Promise.all([
      getDailyTotals(date),
      getMealsForDate(date),
      getWaterForDate(date),
    ]);
    set({ dailyTotals: totals, meals, waterMl: water });
  },

  addMealToStore: async (meal: Meal) => {
    await dbAddMeal(meal);
    await get().refreshDailyData(meal.date);
  },

  addWaterToStore: async (date: string, ml: number) => {
    await dbAddWater(date, ml);
    const total = await getWaterForDate(date);
    const dailyTotals = { ...get().dailyTotals, water_ml: total };
    set({ waterMl: total, dailyTotals });
  },

  switchProfileInStore: async (profileId: string) => {
    await switchProfile(profileId);
    const profile = await getProfile();
    const today = new Date().toISOString().split('T')[0];
    const [totals, meals, water] = await Promise.all([
      getDailyTotals(today),
      getMealsForDate(today),
      getWaterForDate(today),
    ]);
    set({
      profile,
      dailyTotals: totals,
      meals,
      waterMl: water,
    });
  },
}));
