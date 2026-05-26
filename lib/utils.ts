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
