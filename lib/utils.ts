import { Alert } from 'react-native';
import { ALL_ACHIEVEMENTS } from './achievements';

export const CALORIE_TARGET_MIN_RATIO = 0.85;
export const CALORIE_TARGET_MAX_RATIO = 1.05;

export interface XPLevel {
  level: number;
  label: string;
  min: number;
  max: number;
}

export const XP_LEVELS: XPLevel[] = [
  { level: 1, label: 'Débutant',   min: 0,    max: 149   },
  { level: 2, label: 'En route',   min: 150,  max: 399   },
  { level: 3, label: 'Régulier',   min: 400,  max: 799   },
  { level: 4, label: 'Confirmé',   min: 800,  max: 1499  },
  { level: 5, label: 'Discipliné', min: 1500, max: 2499  },
  { level: 6, label: 'Expert',     min: 2500, max: 3999  },
  { level: 7, label: 'Élite',      min: 4000, max: 99999 },
];

export function getLevel(xp: number): XPLevel {
  return XP_LEVELS.find((l) => xp >= l.min && xp <= l.max) ?? XP_LEVELS[XP_LEVELS.length - 1];
}

export function getTotalXP(unlockedIds: string[]): number {
  return ALL_ACHIEVEMENTS
    .filter((a) => unlockedIds.includes(a.id))
    .reduce((sum, a) => sum + a.xp, 0);
}

export function normalizeText(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ').replace(/["""''']/g, '');
}

export function getProfileName(profile: any): string {
  return profile?.display_name?.trim() || profile?.name?.trim() || 'Mon profil';
}

export function getGeminiErrorContent(err: any): { title: string; message: string } {
  if (err?.message === 'QUOTA_EXCEEDED') {
    return {
      title: '🧠 Cerveau en ébullition !',
      message: 'Notre coach IA est débordé ! Donne-lui 2 minutes et il sera de retour en pleine forme.',
    };
  }
  return {
    title: 'Service indisponible',
    message: 'La requête a échoué. Vérifie ta connexion et réessaie.',
  };
}

export function showGeminiError(err: any): void {
  const { title, message } = getGeminiErrorContent(err);
  Alert.alert(title, message, [{ text: 'OK' }]);
}

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// SQLite stores datetime('now') as UTC — this converts for display
export function utcToLocalTimeString(utcString: string): string {
  if (!utcString) return '';
  const date = new Date(utcString.replace(' ', 'T') + 'Z');
  return getLocalTimeString(date);
}

export function utcToLocalDateString(utcString: string): string {
  if (!utcString) return '';
  const date = new Date(utcString.replace(' ', 'T') + 'Z');
  return getLocalDateString(date);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  fallback: () => T,
  retries = 1,
  delayMs = 500
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delayMs));
      return withRetry(fn, fallback, retries - 1, delayMs);
    }
    console.warn('[withRetry] All retries exhausted:', err);
    return fallback();
  }
}
