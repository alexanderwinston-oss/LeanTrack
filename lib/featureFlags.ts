import { AchievementDef } from './achievements';
import { checkAndUnlockAchievements, getProfile, getUnlockedAchievements } from './db';
import { useStore } from './store';
import { getLevel, getTotalXP, XPLevel } from './utils';

export const FEATURE_UNLOCK_LEVELS = {
  WATER_FAVORITES: 2,
  EDIT_YESTERDAY_MEAL: 3,
  AI_COACH: 4,
  EDIT_YESTERDAY_FULL: 5,
  EXPORT_CSV: 6,
  CUSTOM_MACRO_GOALS: 6,
  GOAL_CELEBRATION: 7,
} as const;

export function useFeatureUnlocked(feature: keyof typeof FEATURE_UNLOCK_LEVELS): boolean {
  const unlockedIds = useStore((s) => s.unlockedAchievementIds);
  const currentLevel = getLevel(getTotalXP(unlockedIds)).level;
  return currentLevel >= FEATURE_UNLOCK_LEVELS[feature];
}

export function detectLevelUp(prevUnlockedIds: string[], newlyUnlocked: AchievementDef[]): XPLevel | null {
  if (newlyUnlocked.length === 0) return null;
  const prevLevel = getLevel(getTotalXP(prevUnlockedIds));
  const newIds = [...prevUnlockedIds, ...newlyUnlocked.map((a) => a.id)];
  const newLevel = getLevel(getTotalXP(newIds));
  return newLevel.level > prevLevel.level ? newLevel : null;
}

// Centralized replacement for checkAllAchievements()/checkAndUnlockAchievements() call sites:
// pushes newly-unlocked badges to the badge queue, refreshes unlockedAchievementIds, and
// queues a level-up toast if XP crossed a level threshold. Never call this from app launch —
// launch should call checkAndUnlockAchievements() directly so no toast fires on cold start.
export async function checkAchievementsAndNotify(): Promise<AchievementDef[]> {
  const profile = await getProfile();
  if (!profile) return [];

  const prevIds = useStore.getState().unlockedAchievementIds;
  const newlyUnlocked = await checkAndUnlockAchievements(profile);

  if (newlyUnlocked.length > 0) {
    newlyUnlocked.forEach((b) => useStore.getState().setPendingBadge(b));
    const freshIds = await getUnlockedAchievements();
    useStore.getState().setUnlockedAchievementIds(freshIds);

    const leveledUp = detectLevelUp(prevIds, newlyUnlocked);
    if (leveledUp) useStore.getState().setPendingLevelUp(leveledUp);
  }

  return newlyUnlocked;
}
