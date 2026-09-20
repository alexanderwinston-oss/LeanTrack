import { create } from 'zustand';
import { DailyTotals, Meal, UserProfile } from './types';
import { AchievementDef } from './achievements';
import { addMeal as dbAddMeal, addWater as dbAddWater, getDailyTotals, getMealsForDate, getProfile, getUnlockedAchievements, getWaterForDate, switchProfile } from './db';
import { getLocalDateString, XPLevel } from './utils';

interface AppState {
  profile: UserProfile | null;
  dailyTotals: DailyTotals;
  meals: Meal[];
  waterMl: number;
  pendingImageBase64: string | null;
  currentMealType: string;
  pendingMealDate: string | null;
  badgeQueue: AchievementDef[];
  isModalOpen: boolean;
  unlockedAchievementIds: string[];
  pendingLevelUp: XPLevel | null;
  caloriesBurned: number;
  healthConnectEnabled: boolean;
  pendingHealthToast: { icon: string; title: string; subtitle: string } | null;
  setProfile: (profile: UserProfile) => void;
  refreshDailyData: (date: string) => Promise<void>;
  addMealToStore: (meal: Meal) => Promise<void>;
  addWaterToStore: (date: string, ml: number) => Promise<void>;
  setPendingImage: (b64: string | null) => void;
  setCurrentMealType: (type: string) => void;
  setPendingMealDate: (date: string | null) => void;
  switchProfileInStore: (profileId: string) => Promise<void>;
  setPendingBadge: (badge: AchievementDef) => void;
  dequeueNextBadge: () => void;
  setModalOpen: (open: boolean) => void;
  setUnlockedAchievementIds: (ids: string[]) => void;
  setPendingLevelUp: (level: XPLevel | null) => void;
  setCaloriesBurned: (v: number) => void;
  setHealthConnectEnabled: (v: boolean) => void;
  setPendingHealthToast: (v: { icon: string; title: string; subtitle: string } | null) => void;
}

const emptyTotals = (date: string): DailyTotals => ({
  date, calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0,
});

export const useStore = create<AppState>((set, get) => ({
  profile: null,
  dailyTotals: emptyTotals(getLocalDateString()),
  meals: [],
  waterMl: 0,
  pendingImageBase64: null,
  currentMealType: 'dejeuner',
  pendingMealDate: null,
  badgeQueue: [],
  isModalOpen: false,
  unlockedAchievementIds: [],
  pendingLevelUp: null,
  caloriesBurned: 0,
  healthConnectEnabled: false,
  pendingHealthToast: null,

  setProfile: (profile) => set({ profile }),
  setPendingImage: (b64) => set({ pendingImageBase64: b64 }),
  setCurrentMealType: (type) => set({ currentMealType: type }),
  setPendingMealDate: (date) => set({ pendingMealDate: date }),
  setPendingBadge: (badge) => set((state) => ({ badgeQueue: [...state.badgeQueue, badge] })),
  dequeueNextBadge: () => set((state) => ({ badgeQueue: state.badgeQueue.slice(1) })),
  setModalOpen: (open) => set({ isModalOpen: open }),
  setUnlockedAchievementIds: (ids) => set({ unlockedAchievementIds: ids }),
  setPendingLevelUp: (level) => set({ pendingLevelUp: level }),
  setCaloriesBurned: (v) => set({ caloriesBurned: v }),
  setHealthConnectEnabled: (v) => set({ healthConnectEnabled: v }),
  setPendingHealthToast: (v) => set({ pendingHealthToast: v }),

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
    const today = getLocalDateString();
    const [totals, meals, water, unlockedIds] = await Promise.all([
      getDailyTotals(today),
      getMealsForDate(today),
      getWaterForDate(today),
      getUnlockedAchievements(),
    ]);
    set({
      profile,
      dailyTotals: totals,
      meals,
      waterMl: water,
      unlockedAchievementIds: unlockedIds,
    });
  },
}));
