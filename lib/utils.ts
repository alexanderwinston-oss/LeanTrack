import { Alert } from 'react-native';

export function normalizeText(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ').replace(/["""''']/g, '');
}

export function getProfileName(profile: any): string {
  return profile?.display_name?.trim() || profile?.name?.trim() || 'Mon profil';
}

export function getGeminiErrorContent(err: any): { title: string; message: string } {
  if (err?.message === 'QUOTA_EXCEEDED') {
    return {
      title: 'Quota dépassé',
      message: 'Le quota API Gemini est dépassé. Réessaie dans quelques minutes.',
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
