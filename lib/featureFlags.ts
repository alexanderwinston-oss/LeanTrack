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

export const LEVEL_FEATURES = [
  { level: 1, name: 'Débutant', xp: 0,
    summary: 'Accès complet à l\'app de base',
    detail: 'Journal alimentaire, suivi de l\'eau, suivi du poids, badges et récap hebdomadaire.' },
  { level: 2, name: 'En route', xp: 150,
    summary: 'Favoris eau et volumes personnalisés',
    detail: 'Sauvegarde tes contenants préférés pour ajouter de l\'eau en un tap. Crée des volumes sur mesure.' },
  { level: 3, name: 'Régulier', xp: 400,
    summary: 'Modifier les repas de la veille',
    detail: 'Édite ou supprime un repas enregistré hier. Pratique pour corriger une erreur de saisie.' },
  { level: 4, name: 'Confirmé', xp: 800,
    summary: 'Coach IA — analyse hebdomadaire',
    detail: 'Reçois une analyse personnalisée de ta semaine alimentaire générée par IA, avec des recommandations concrètes.' },
  { level: 5, name: 'Discipliné', xp: 1500,
    summary: 'Ajout complet sur J-1 (repas + eau)',
    detail: 'Ajoute de nouveaux repas et entrées d\'eau pour hier. Idéal si tu as oublié de logger en temps réel.' },
  { level: 6, name: 'Expert', xp: 2500,
    summary: 'Export CSV + objectifs personnalisables',
    detail: 'Exporte toutes tes données en CSV. Personnalise tes objectifs caloriques et macros jour par jour.' },
  { level: 7, name: 'Élite', xp: 4000,
    summary: 'Célébration objectif atteint',
    detail: 'Quand tu atteins ton poids cible, l\'app te le célèbre avec un récap visuel de tout ton parcours.' },
] as const;

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
